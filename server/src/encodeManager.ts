// server/src/encodeManager.ts
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import kill from 'tree-kill';
import { ENCODES_OUTPUT_PATH } from './config.js';

export interface EncodeJob {
  id: string;
  filePath: string;
  // Video params
  videoCodec: string;
  videoPreset: string;
  videoCrf: number;
  rc_mode?: number;
  qp_init?: number;
  // Audio params
  audioCodec: string;
  audioBitrate: string;
  // Filter params
  aspectRatio: string;
  crop: string | null;
  deinterlace: boolean;
  // Other params
  audioStreams: number[];
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  outputPath?: string;
  outputFilename?: string;
  startTime?: number;
  originalFileSize?: number;
  currentFileSize?: number;
}

class EncodeManager extends EventEmitter {
  private queue: EncodeJob[] = [];
  private currentJob: EncodeJob | null = null;
  private currentProcess: ChildProcess | null = null;

  constructor() {
    super();
  }

  async initialize() {
    await fs.mkdir(ENCODES_OUTPUT_PATH, { recursive: true });
  }

  async addJob(jobDetails: Omit<EncodeJob, 'id' | 'status' | 'progress'>): Promise<EncodeJob> {
    const stats = await fs.stat(jobDetails.filePath);
    const job: EncodeJob = {
      ...jobDetails,
      id: Date.now().toString(),
      status: 'pending',
      progress: 0,
      originalFileSize: stats.size,
    };
    this.queue.push(job);
    console.log(`[EncodeManager] Job added to queue: ${job.id} for file ${job.filePath}`);
    this.emit('queueUpdate', this.getQueueState());
    this.processQueue();
    return job;
  }

  private async processQueue() {
    if (this.currentJob || this.queue.length === 0) {
      return;
    }

    this.currentJob = this.queue.shift()!;
    this.currentJob.status = 'processing';
    this.currentJob.startTime = Date.now();
    console.log(`[EncodeManager] Processing job: ${this.currentJob.id}`);
    this.emit('queueUpdate', this.getQueueState());

    try {
      const job = this.currentJob;
      const outputFileName = (job.outputFilename && job.outputFilename.trim() !== '')
        ? `${job.outputFilename}.mp4`
        : `${path.basename(job.filePath, '.mkv')}-encoded.mp4`;
      const outputPath = path.join(ENCODES_OUTPUT_PATH, outputFileName);
      job.outputPath = outputPath;

      const args: string[] = [
        '-i', job.filePath,
        '-map', '0:v:0',
        '-c:v', job.videoCodec,
      ];

      // Add codec-specific video parameters
      if (job.videoCodec === 'libx264' || job.videoCodec === 'libx265') {
        args.push('-preset', job.videoPreset);
        args.push('-crf', String(job.videoCrf));
      } else if (job.videoCodec === 'hevc_rkmpp') {
          if (job.rc_mode !== undefined) {
              args.push('-rc_mode', String(job.rc_mode));
          }
          if (job.qp_init !== undefined) {
              args.push('-qp_init', String(job.qp_init));
          }
      }

      const videoFilters: string[] = [];
      if (job.deinterlace) videoFilters.push('yadif');
      if (job.crop) videoFilters.push(job.crop);
      if (job.aspectRatio && job.aspectRatio !== 'None') {
        videoFilters.push(`setdar=dar=${job.aspectRatio.replace(':', '/')}`);
      }

      if (videoFilters.length > 0) {
        args.push('-vf', videoFilters.join(','));
      }

      job.audioStreams.forEach((streamIndex, i) => {
        args.push('-map', `0:${streamIndex}`);
        args.push(`-c:a:${i}`, job.audioCodec, `-b:a:${i}`, job.audioBitrate);
      });
      
      args.push('-map_chapters', '0');
      args.push('-movflags', '+faststart');

      args.push('-y', outputPath);
      console.log(`[EncodeManager] Spawning ffmpeg with args: ${args.join(' ')}`);

      this.currentProcess = spawn('/usr/lib/jellyfin-ffmpeg/ffmpeg', args);
      
      let ffmpegOutput = '';
      let totalDuration = 0;

      const progressInterval = setInterval(async () => {
        try {
            const stats = await fs.stat(outputPath);
            job.currentFileSize = stats.size;
            this.emit('queueUpdate', this.getQueueState());
        } catch (e) {
            // file might not exist yet, ignore
        }
      }, 2000);


      this.currentProcess.stderr?.on('data', (data) => {
        const stderr = data.toString();
        ffmpegOutput += stderr;

        if (totalDuration === 0) {
            const durationMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
            if(durationMatch) {
                totalDuration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3]);
            }
        }
        
        const timeMatch = stderr.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (timeMatch && totalDuration > 0) {
            const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
            const progress = Math.min(100, Math.round((currentTime / totalDuration) * 100));
            if (job.progress !== progress) {
                job.progress = progress;
                this.emit('queueUpdate', this.getQueueState());
            }
        }
      });

      this.currentProcess.on('close', (code) => {
        clearInterval(progressInterval);
        if (job.status === 'processing') { // Not already cancelled
            if (code === 0) {
                job.status = 'completed';
                job.progress = 100;
                console.log(`[EncodeManager] Job completed: ${job.id}`);
            } else {
                job.status = 'failed';
                job.error = `ffmpeg exited with code ${code}. See logs for details.`;
                console.error(`[EncodeManager] Job failed: ${job.id} with error: ${job.error}`);
                console.error(`[EncodeManager] Full ffmpeg output for job ${job.id}:\n${ffmpegOutput}`);
            }
        }
        this.currentJob = null;
        this.currentProcess = null;
        this.emit('queueUpdate', this.getQueueState());
        this.processQueue();
      });

    } catch (error) {
        // ... (error handling)
    }
  }

  cancelJob(jobId: string) {
    console.log(`[EncodeManager] Cancelling job: ${jobId}`);
    if (this.currentJob && this.currentJob.id === jobId && this.currentProcess) {
        this.currentJob.status = 'cancelled';
        kill(this.currentProcess.pid!, 'SIGKILL', (err) => {
            if (err) {
                console.error(`[EncodeManager] Failed to kill process for job ${jobId}: ${err}`);
            } else {
                console.log(`[EncodeManager] Killed process for job ${jobId}`);
            }
        });
    } else {
      this.queue = this.queue.filter(job => job.id !== jobId);
    }
    this.emit('queueUpdate', this.getQueueState());
  }


  getQueueState() {
    return {
      queue: this.queue,
      currentJob: this.currentJob,
    };
  }
}

export const encodeManager = new EncodeManager();