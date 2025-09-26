// server/src/encodeManager.ts
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { ENCODES_DIR } from './config.js';

export interface EncodeJob {
  id: string;
  filePath: string;
  // Video params
  videoCodec: string;
  videoPreset: string;
  videoCrf: number;
  // Audio params
  audioCodec: string;
  audioBitrate: string;
  // Filter params
  aspectRatio: string;
  crop: string | null;
  deinterlace: boolean;
  // Other params
  audioStreams: number[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  outputPath?: string;
  startTime?: number;
}

class EncodeManager extends EventEmitter {
  private queue: EncodeJob[] = [];
  private currentJob: EncodeJob | null = null;

  constructor() {
    super();
  }

  async initialize() {
    await fs.mkdir(ENCODES_DIR, { recursive: true });
  }

  addJob(jobDetails: Omit<EncodeJob, 'id' | 'status' | 'progress'>): EncodeJob {
    const job: EncodeJob = {
      ...jobDetails,
      id: Date.now().toString(),
      status: 'pending',
      progress: 0,
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
      const outputFileName = `${path.basename(job.filePath, '.mkv')}-encoded.mp4`;
      const outputPath = path.join(ENCODES_DIR, outputFileName);
      job.outputPath = outputPath;

      const args: string[] = [
        '-i', job.filePath,
        '-map', '0:v:0',
        '-c:v', job.videoCodec,
        '-preset', job.videoPreset,
        '-crf', String(job.videoCrf),
      ];

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

      args.push('-y', outputPath);
      console.log(`[EncodeManager] Spawning ffmpeg with args: ${args.join(' ')}`);

      const ffmpeg = spawn('ffmpeg', args);
      
      let ffmpegOutput = '';
      let totalDuration = 0;

      ffmpeg.stderr.on('data', (data) => {
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

      ffmpeg.on('close', (code) => {
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
        this.currentJob = null;
        this.emit('queueUpdate', this.getQueueState());
        this.processQueue();
      });

    } catch (error) {
        if (this.currentJob) {
            this.currentJob.status = 'failed';
            this.currentJob.error = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[EncodeManager] Job failed: ${this.currentJob.id} with error: ${this.currentJob.error}`);
            this.currentJob = null;
        }
        this.emit('queueUpdate', this.getQueueState());
        this.processQueue();
    }
  }

  cancelJob(jobId: string) {
    console.log(`[EncodeManager] Cancelling job: ${jobId}`);
    if (this.currentJob && this.currentJob.id === jobId) {
        // Complex cancellation logic (killing ffmpeg process) omitted for brevity
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