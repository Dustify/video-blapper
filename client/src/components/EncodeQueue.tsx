// client/src/components/EncodeQueue.tsx
import { useState, useEffect } from 'react';

interface EncodeJob {
  id: string;
  filePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  outputPath?: string;
  startTime?: number;
  originalFileSize?: number;
  currentFileSize?: number;
}

interface QueueState {
  queue: EncodeJob[];
  currentJob: EncodeJob | null;
}

function formatRemainingTime(seconds: number): string {
    if (seconds < 0 || !isFinite(seconds)) return '--:--';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return h !== '00' ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const formatBytes = (bytes: number | undefined): string => {
    if (bytes === undefined || isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export function EncodeQueue() {
  const [queueState, setQueueState] = useState<QueueState>({ queue: [], currentJob: null });

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/encode/queue');
      const data = await res.json();
      setQueueState(data);
    } catch (error) {
      console.error("Failed to fetch encode queue", error);
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchQueue, 2000);
    fetchQueue();
    return () => clearInterval(interval);
  }, []);

  const handleCancel = async (jobId: string) => {
      try {
          await fetch(`/api/encode/cancel/${jobId}`, { method: 'POST' });
          fetchQueue(); // Refresh queue immediately
      } catch (error) {
          console.error(`Failed to cancel job ${jobId}`, error);
      }
  };

  const renderJob = (job: EncodeJob) => {
    const timeDetails = {
        elapsed: '',
        remaining: '',
        total: '',
        estimatedSize: ''
    };

    if (job.status === 'processing' && job.startTime && job.progress > 0) {
        const elapsedMs = Date.now() - job.startTime;
        const totalEstimatedMs = (elapsedMs / job.progress) * 100;
        const remainingMs = totalEstimatedMs - elapsedMs;

        timeDetails.elapsed = formatRemainingTime(elapsedMs / 1000);
        timeDetails.remaining = formatRemainingTime(remainingMs / 1000);
        timeDetails.total = formatRemainingTime(totalEstimatedMs / 1000);

        if (job.currentFileSize) {
            const estimatedTotalSize = (job.currentFileSize / job.progress) * 100;
            timeDetails.estimatedSize = ` / est. ${formatBytes(estimatedTotalSize)}`;
        }
    }


    return (
        <div key={job.id} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px' }}>
            <p style={{ wordBreak: 'break-all' }}><b>File:</b> {job.filePath}</p>
            {job.outputPath && <p style={{ wordBreak: 'break-all' }}><b>Output:</b> {job.outputPath}</p>}
            <p><b>Status:</b> {job.status}</p>
            {job.status === 'processing' && (
                <>
                    <progress value={job.progress} max="100" style={{ width: '100%' }} />
                    <p>{job.progress}%</p>
                    <p>
                        Elapsed: {timeDetails.elapsed} | 
                        Remaining: {timeDetails.remaining} | 
                        Total: {timeDetails.total}
                    </p>
                    <p>Size: {formatBytes(job.currentFileSize)}{timeDetails.estimatedSize}</p>
                </>
            )}
            <p>Original Size: {formatBytes(job.originalFileSize)}</p>
            {job.error && <p style={{ color: 'red' }}>{job.error}</p>}
            {(job.status === 'pending' || job.status === 'processing') && (
                <button onClick={() => handleCancel(job.id)}>Cancel</button>
            )}
        </div>
    );
  };

  return (
    <div>
      <h3>Encode Queue</h3>
      {queueState.currentJob && (
        <div>
          <h4>In Progress</h4>
          {renderJob(queueState.currentJob)}
        </div>
      )}
      {queueState.queue.length > 0 && (
        <div>
          <h4>Pending</h4>
          {queueState.queue.map(renderJob)}
        </div>
      )}
      {!queueState.currentJob && queueState.queue.length === 0 && (
        <p>No jobs in queue.</p>
      )}
    </div>
  );
}