// server/src/routes/api.ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { MOUNTED_FOLDER_PATH, SCREENSHOTS_DIR } from '../config.js';
import { encodeManager } from '../encodeManager.js';

const router = Router();

// --- Helper function (moved here as it's only used by this router) ---
async function findMkvFiles(directory: string): Promise<string[]> {
  let mkvFiles: string[] = [];
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        mkvFiles = mkvFiles.concat(await findMkvFiles(fullPath));
      } else if (path.extname(entry.name).toLowerCase() === '.mkv') {
        mkvFiles.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Could not read directory: ${directory}`, error);
  }
  return mkvFiles;
}

// --- Restored robust crop detection ---
async function detectCrop(filePath: string, duration: number): Promise<string> {
    const timestamps = [
      duration * 0.2, // 20%
      duration * 0.5, // 50%
      duration * 0.8, // 80%
    ];

    const cropResults: string[] = [];

    for (const ts of timestamps) {
      const crop = await new Promise<string>((resolve, reject) => {
        const ffmpegProcess = spawn('ffmpeg', [
          '-ss', String(ts),
          '-t', '5', // analyze for 5 seconds
          '-i', filePath,
          '-vf', 'cropdetect',
          '-f', 'null',
          '-'
        ]);

        let stderr = '';
        ffmpegProcess.stderr.on('data', (data) => (stderr += data.toString()));
        ffmpegProcess.on('error', reject);
        ffmpegProcess.on('close', () => {
          const cropRegex = /crop=\d+:\d+:\d+:\d+/g;
          const matches = stderr.match(cropRegex);
          if (matches && matches.length > 0) {
            resolve(matches[matches.length - 1]);
          } else {
            resolve('No crop detected');
          }
        });
      });
      cropResults.push(crop);
    }

    // Find the most frequent crop value
    const cropCounts = cropResults.reduce((acc, crop) => {
      acc[crop] = (acc[crop] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostFrequentCrop = Object.keys(cropCounts).reduce((a, b) =>
      cropCounts[a] > cropCounts[b] ? a : b
    );

    if (mostFrequentCrop !== 'No crop detected') {
      return mostFrequentCrop;
    }

    return 'No crop detected';
  }

// --- API Routes ---
router.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello from the API! 👋' });
});

router.get('/mkv-files', async (req: Request, res: Response) => {
  try {
    const files = await findMkvFiles(MOUNTED_FOLDER_PATH);
    const filesWithIds = files.map(filePath => ({
        filePath,
        id: Buffer.from(filePath).toString('base64url'),
    }));
    res.json({ files: filesWithIds });
  } catch (error) {
    console.error("Error scanning for MKV files:", error);
    res.status(500).json({ message: "Failed to find files." });
  }
});

router.post('/generate-screenshots', async (req: Request, res: Response) => {
  const { filePath, aspectRatio } = req.body;
  if (!filePath) {
    return res.status(400).json({ message: 'filePath is required.' });
  }

  try {
    console.log(`[Request for ${path.basename(filePath)}]`);
    const mediaInfo = await new Promise<any>((resolve, reject) => {
      const ffprobeProcess = spawn('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath]);
      let stdout = '';
      ffprobeProcess.stdout.on('data', (data) => (stdout += data.toString()));
      ffprobeProcess.on('error', reject);
      ffprobeProcess.on('close', (code) => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error('ffprobe failed to get media info')));
    });

    const duration = parseFloat(mediaInfo?.format?.duration);
    if (isNaN(duration)) throw new Error('Could not parse video duration from media info.');

    const cropDetectResult = await detectCrop(filePath, duration);
    const videoStream = mediaInfo?.streams?.find((s: any) => s.codec_type === 'video');
    const filters: string[] = [];
    let deinterlaceReason: string | null = null;
    let cropDimensions = null;

    console.log(`→ Client requested aspect ratio: ${aspectRatio || 'None'}`);
    console.log(`→ Video Stream Details from ffprobe:`);
    console.log(`  - Width: ${videoStream?.width}`);
    console.log(`  - Height: ${videoStream?.height}`);
    console.log(`  - Sample Aspect Ratio (SAR): ${videoStream?.sample_aspect_ratio}`);
    console.log(`  - Display Aspect Ratio (DAR): ${videoStream?.display_aspect_ratio}`);

    if (videoStream?.field_order && videoStream.field_order !== 'progressive') {
      filters.push('yadif');
      deinterlaceReason = videoStream.field_order.toUpperCase();
    }

    if (cropDetectResult.startsWith('crop=')) {
        filters.push(cropDetectResult);
        const parts = cropDetectResult.replace('crop=', '').split(':');
        cropDimensions = {
            w: parseInt(parts[0], 10),
            h: parseInt(parts[1], 10),
            x: parseInt(parts[2], 10),
            y: parseInt(parts[3], 10),
        };
    }

    if (aspectRatio && aspectRatio !== 'None' && videoStream) {
        const [arW, arH] = aspectRatio.split(':').map(Number);
        if (arW && arH) {
            const currentWidth = cropDimensions ? cropDimensions.w : videoStream.width;
            const newHeight = Math.round(currentWidth * (arH / arW));
            const scaleFilter = `scale=${currentWidth}:${newHeight}`;
            filters.push(scaleFilter);
            console.log(`→ Applying manual aspect ratio. Adding filter: "${scaleFilter}"`);
        }
    } else {
        console.log('→ No manual aspect ratio override. Not applying scale filter.');
    }

    console.log(`→ Final FFmpeg filters: [${filters.join(', ')}]`);

    const fileHash = crypto.createHash('sha1').update(filePath).digest('hex');
    const outputDir = path.join(SCREENSHOTS_DIR, fileHash);
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });

    const screenshotUrls: string[] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise<void>((resolve, reject) => {
        const timestamp = (duration / 13) * (i + 1);
        const screenshotName = `${String(i + 1).padStart(2, '0')}.jpg`;
        const outputPath = path.join(outputDir, screenshotName);

        const args = ['-sn', '-ss', String(timestamp), '-i', filePath];
        if (filters.length > 0) args.push('-vf', filters.join(', '));
        args.push('-vframes', '1', '-q:v', '2', outputPath);

        const ffmpegProcess = spawn('ffmpeg', args);
        ffmpegProcess.on('error', reject);
        ffmpegProcess.on('close', (code) => {
          if (code === 0) {
            screenshotUrls.push(`/screenshots/${fileHash}/${screenshotName}`);
            resolve();
          } else {
            reject(new Error(`ffmpeg exited with code ${code} for screenshot ${i + 1}`));
          }
        });
      });
    }

    res.json({
      screenshotUrls,
      cropDetectResult,
      mediaInfo,
      deinterlaceReason,
      videoStream: {
        width: videoStream?.width,
        height: videoStream?.height,
        sample_aspect_ratio: videoStream?.sample_aspect_ratio,
        cropDimensions,
      }
    });

  } catch (error) {
    console.error('Failed to generate screenshots or detect crop:', error);
    res.status(500).json({ message: 'Failed to generate screenshots or detect crop.' });
  }
});

// --- Encode Queue Routes ---

router.post('/encode', (req, res) => {
    const { 
        filePath, 
        aspectRatio, 
        audioStreams, 
        crop, 
        deinterlace,
        videoCodec,
        videoPreset,
        videoCrf,
        audioCodec,
        audioBitrate
    } = req.body;

    if (!filePath || !audioStreams) {
      return res.status(400).json({ message: 'filePath and audioStreams are required.' });
    }
    const job = encodeManager.addJob({ 
        filePath, 
        aspectRatio, 
        audioStreams, 
        crop, 
        deinterlace,
        videoCodec: videoCodec || 'libx265',
        videoPreset: videoPreset || 'veryslow',
        videoCrf: videoCrf || 18,
        audioCodec: audioCodec || 'aac',
        audioBitrate: audioBitrate || '160k'
    });
    res.status(202).json(job);
});

router.get('/encode/queue', (req, res) => {
    res.json(encodeManager.getQueueState());
});

router.post('/encode/cancel/:jobId', (req, res) => {
    const { jobId } = req.params;
    encodeManager.cancelJob(jobId);
    res.status(200).json({ message: 'Job cancellation requested.' });
});


export default router;