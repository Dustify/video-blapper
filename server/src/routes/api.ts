import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { MOUNTED_FOLDER_PATH, SCREENSHOTS_DIR } from '../config.js';

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

// --- API Routes ---
router.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello from the API! 👋' });
});

router.get('/mkv-files', async (req: Request, res: Response) => {
  try {
    const files = await findMkvFiles(MOUNTED_FOLDER_PATH);
    res.json({ files });
  } catch (error) {
    console.error("Error scanning for MKV files:", error);
    res.status(500).json({ message: "Failed to find files." });
  }
});

router.post('/generate-screenshots', async (req: Request, res: Response) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ message: 'filePath is required.' });
  }

  try {
    const mediaInfoPromise = new Promise<any>((resolve, reject) => {
      const ffprobeProcess = spawn('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath]);
      let stdout = '';
      ffprobeProcess.stdout.on('data', (data) => (stdout += data.toString()));
      ffprobeProcess.on('error', reject);
      ffprobeProcess.on('close', (code) => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error('ffprobe failed to get media info')));
    });

    const cropDetectPromise = new Promise<string>((resolve, reject) => {
      const ffmpegProcess = spawn('ffmpeg', ['-ss', '600', '-t', '10', '-i', filePath, '-vf', 'cropdetect', '-f', 'null', '-']);
      let stderr = '';
      ffmpegProcess.stderr.on('data', (data) => (stderr += data.toString()));
      ffmpegProcess.on('error', reject);
      ffmpegProcess.on('close', () => {
        const cropRegex = /crop=\d+:\d+:\d+:\d+/g;
        const matches = stderr.match(cropRegex);
        if (matches && matches.length > 0) {
          resolve(matches[matches.length - 1] as string);
        } else {
          resolve('No crop detected');
        }
      });
    });

    const [mediaInfo, cropDetectResult] = await Promise.all([mediaInfoPromise, cropDetectPromise]);
    const videoStream = mediaInfo?.streams?.find((s: any) => s.codec_type === 'video');
    const duration = parseFloat(mediaInfo?.format?.duration);
    if (isNaN(duration)) throw new Error('Could not parse video duration from media info.');

    const filters: string[] = [];
    let deinterlaceReason: string | null = null;

    // --- New type for aspect ratio details ---
    type AspectRatioInfo = {
      sar: string;
      dar: string;
      originalResolution: string;
      targetResolution: string;
    };
    let aspectRatioDetails: AspectRatioInfo | null = null;

    if (videoStream?.field_order && videoStream.field_order !== 'progressive') {
      filters.push('yadif');
      deinterlaceReason = videoStream.field_order.toUpperCase();
    }
    if (videoStream?.sample_aspect_ratio && videoStream.sample_aspect_ratio !== '1:1') {
      filters.push('scale=iw*sar:ih');
      const sar = videoStream.sample_aspect_ratio; // e.g., "10:11"
      const [sarNum, sarDen] = sar.split(':').map(Number);
      const originalWidth = videoStream.width;
      const originalHeight = videoStream.height;
      
      if (originalWidth && originalHeight && sarNum && sarDen) {
        const targetWidth = Math.round(originalWidth * (sarNum / sarDen));
        aspectRatioDetails = { 
            sar, 
            dar: videoStream.display_aspect_ratio,
            originalResolution: `${originalWidth}x${originalHeight}`,
            targetResolution: `${targetWidth}x${originalHeight}`
        };
      }
    }
    if (cropDetectResult.startsWith('crop=')) {
      filters.push(cropDetectResult);
    }

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
        if (filters.length > 0) args.push('-vf', filters.join(','));
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
      aspectRatioDetails,
    });

  } catch (error) {
    console.error('Failed to generate screenshots or detect crop:', error);
    res.status(500).json({ message: 'Failed to generate screenshots or detect crop.' });
  }
});

export default router;