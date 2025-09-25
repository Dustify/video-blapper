// client/src/components/MkvFileSelector.tsx
import { useState, useEffect } from 'react';

interface StreamTags {
  language?: string;
  title?: string;
}

interface MediaStream {
  codec_type: 'video' | 'audio';
  codec_name: string;
  tags?: StreamTags;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  channel_layout?: string;
}

interface FormatInfo {
  format_name: string;
  duration: string;
  size: string;
}

interface MediaInfo {
  streams: MediaStream[];
  format: FormatInfo;
}

// --- Updated type for aspect ratio details ---
interface AspectRatioDetails {
  sar: string;
  dar: string;
  originalResolution: string;
  targetResolution: string;
}

const formatDuration = (secondsStr: string): string => {
  const seconds = parseFloat(secondsStr);
  if (isNaN(seconds)) return 'N/A';
  return new Date(seconds * 1000).toISOString().slice(11, 19);
};

const formatBytes = (bytesStr: string): string => {
  const bytes = parseInt(bytesStr, 10);
  if (isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export function MkvFileSelector() {
  const [mkvFiles, setMkvFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isFetchingList, setIsFetchingList] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [cropResult, setCropResult] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [cacheBuster, setCacheBuster] = useState<number>(Date.now());
  
  const [deinterlaceReason, setDeinterlaceReason] = useState<string | null>(null);
  const [aspectRatioDetails, setAspectRatioDetails] = useState<AspectRatioDetails | null>(null);

  useEffect(() => {
    fetch('/api/mkv-files')
      .then(res => res.json())
      .then(data => setMkvFiles(data.files))
      .catch(err => {
        setError('Failed to fetch MKV files. Is the server running?');
        console.error(err);
      })
      .finally(() => setIsFetchingList(false));
  }, []);

  const handleFileSelect = async (filePath: string) => {
    setSelectedFile(filePath);
    setIsProcessing(true);
    setScreenshots([]);
    setCropResult(null);
    setMediaInfo(null);
    setError(null);
    setDeinterlaceReason(null);
    setAspectRatioDetails(null);

    try {
      const response = await fetch('/api/generate-screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });

      if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || 'Failed to process file');
      }

      const data = await response.json();
      setScreenshots(data.screenshotUrls);
      setCropResult(data.cropDetectResult);
      setMediaInfo(data.mediaInfo);
      setCacheBuster(Date.now());
      setDeinterlaceReason(data.deinterlaceReason);
      setAspectRatioDetails(data.aspectRatioDetails);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isFetchingList) return <p>Searching for MKV files...</p>;

  const renderMediaInfo = () => {
    if (!mediaInfo) return null;
    const videoStreams = mediaInfo.streams.filter((s) => s.codec_type === 'video');
    const audioStreams = mediaInfo.streams.filter((s) => s.codec_type === 'audio');
    return (
      <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '20px' }}>
        <h4>Media Information</h4>
        <p><b>Container:</b> {mediaInfo.format.format_name} | <b>Duration:</b> {formatDuration(mediaInfo.format.duration)} | <b>Size:</b> {formatBytes(mediaInfo.format.size)}</p>
        {videoStreams.map((s, i) => (
          <div key={i}><b>Video:</b> {s.codec_name}, {s.width}x{s.height}, {s.avg_frame_rate} fps</div>
        ))}
        {audioStreams.map((s, i) => (
          <div key={i}><b>Audio:</b> {s.tags?.language?.toUpperCase()} {s.codec_name} ({s.channel_layout})</div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <h2>Select an MKV File 📂</h2>
      <ul>
        {mkvFiles.map(file => (
          <li key={file} style={{ margin: '8px 0' }}>
            <button onClick={() => handleFileSelect(file)} disabled={isProcessing}>{file}</button>
          </li>
        ))}
      </ul>
      
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {selectedFile && (
        <div style={{ marginTop: '20px' }}>
          <p><b>Selected:</b> {selectedFile}</p>
          {isProcessing && <p>Analyzing and generating screenshots...</p>}

          {!isProcessing && (
            <>
              {renderMediaInfo()}
              <div style={{ backgroundColor: '#eee', padding: '10px', margin: '10px 0' }}>
                {cropResult && (
                  <p style={{ margin: 0, paddingBottom: (deinterlaceReason || aspectRatioDetails) ? '8px' : '0' }}>
                    <b>Crop Analysis:</b> {cropResult.startsWith('crop=') 
                      ? `Detected and applied (${cropResult}).` 
                      : 'No crop detected.'}
                  </p>
                )}
                {(deinterlaceReason || aspectRatioDetails) && (
                   <div style={{fontSize: '0.9em'}}>
                    <b>Corrections Applied:</b>
                    {deinterlaceReason && 
                      <span style={{display: 'block', marginLeft: '10px'}}>• Deinterlacing (Field Order: {deinterlaceReason})</span>}
                    {/* --- Updated display for aspect ratio details --- */}
                    {aspectRatioDetails && 
                      <span style={{display: 'block', marginLeft: '10px'}}>
                        • Aspect Ratio Correction (SAR: {aspectRatioDetails.sar}): <b>{aspectRatioDetails.originalResolution} → {aspectRatioDetails.targetResolution}</b>
                      </span>}
                  </div>
                )}
              </div>
              {screenshots.length > 0 && (
                <div>
                  <h3>Screenshots:</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {screenshots.map((url, index) => (
                      <img
                        key={`${url}-${cacheBuster}`}
                        src={`${url}?v=${cacheBuster}`}
                        alt={`Screenshot ${index + 1}`}
                        style={{ maxWidth: '200px', height: 'auto', border: '1px solid #ccc' }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}