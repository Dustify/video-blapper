// client/src/components/EncodeQueue.tsx
import { useState, useEffect } from 'react';

interface EncodeJob {
  id: string;
  filePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  startTime?: number; // Added for ETC calculation
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

export function EncodeQueue() {
  const [queueState, setQueueState] = useState<QueueState>({ queue: [], currentJob: null });

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const res = await fetch('/api/encode/queue');
        const data = await res.json();
        setQueueState(data);
      } catch (error) {
        console.error("Failed to fetch encode queue", error);
      }
    };

    const interval = setInterval(fetchQueue, 2000); // Poll every 2 seconds
    fetchQueue();

    return () => clearInterval(interval);
  }, []);

  const renderJob = (job: EncodeJob) => {
    let etc = '';
    if (job.status === 'processing' && job.startTime && job.progress > 0) {
        const elapsedMs = Date.now() - job.startTime;
        const totalEstimatedMs = (elapsedMs / job.progress) * 100;
        const remainingMs = totalEstimatedMs - elapsedMs;
        etc = ` (ETC: ${formatRemainingTime(remainingMs / 1000)})`;
    }

    return (
        <div key={job.id} style={{ border: '1px solid #ddd', padding: '10px', marginBottom: '10px' }}>
            <p style={{ wordBreak: 'break-all' }}><b>File:</b> {job.filePath}</p>
            <p><b>Status:</b> {job.status}</p>
            {job.status === 'processing' && (
                <>
                    <progress value={job.progress} max="100" style={{ width: '100%' }} />
                    <p>{job.progress}%{etc}</p>
                </>
            )}
            {job.error && <p style={{ color: 'red' }}>{job.error}</p>}
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