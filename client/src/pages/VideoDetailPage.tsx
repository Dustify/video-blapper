// client/src/pages/VideoDetailPage.tsx
import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';

// ... (Keep all the interface definitions: StreamTags, MediaStream, etc.)
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

const ASPECT_RATIO_OPTIONS = ['None', '4:3', '16:9', '1.85:1', '2.39:1'];

// ... (Keep the helper functions: getBestAspectRatio, formatDuration, formatBytes)
const getBestAspectRatio = (dar: string | null): string => {
    if (!dar) return ASPECT_RATIO_OPTIONS[0];

    const darValue = dar.includes(':') ? parseFloat(dar.split(':')[0]) / parseFloat(dar.split(':')[1]) : parseFloat(dar);
    if (isNaN(darValue)) return ASPECT_RATIO_OPTIONS[0];

    let closestOption = ASPECT_RATIO_OPTIONS[0];
    let smallestDiff = Infinity;

    const ratios: { [key: string]: number } = {
        '4:3': 4 / 3,
        '16:9': 16 / 9,
        '1.85:1': 1.85,
        '2.39:1': 2.39,
    };

    for (const option in ratios) {
        const diff = Math.abs(darValue - ratios[option]);
        if (diff < smallestDiff) {
            smallestDiff = diff;
            closestOption = option;
        }
    }
    
    if (smallestDiff < 0.1) {
        return closestOption;
    }
    
    return ASPECT_RATIO_OPTIONS[0];
};

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


export function VideoDetailPage() {
    const { fileId } = useParams<{ fileId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();

    const [screenshots, setScreenshots] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [cropResult, setCropResult] = useState<string | null>(null);
    const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
    const [cacheBuster, setCacheBuster] = useState<number>(Date.now());
    const [deinterlaceReason, setDeinterlaceReason] = useState<string | null>(null);
    
    const filePath = fileId ? atob(fileId) : null;
    const currentAspectRatio = searchParams.get('ar') || 'None';

    useEffect(() => {
        if (!filePath) return;

        const generateScreenshots = async () => {
            setIsProcessing(true);
            setError(null);
            try {
                const response = await fetch('/api/generate-screenshots', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath, aspectRatio: currentAspectRatio }),
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.message || 'Failed to process file');
                }

                const data = await response.json();
                
                setScreenshots(data.screenshotUrls);
                setMediaInfo(data.mediaInfo);
                setCacheBuster(Date.now());
                setDeinterlaceReason(data.deinterlaceReason);
                setCropResult(data.cropDetectResult);

                // On initial load, set the best-guess aspect ratio
                if (!searchParams.get('ar')) {
                    const bestGuess = getBestAspectRatio(data.displayAspectRatio);
                    if (bestGuess !== 'None') {
                        setSearchParams({ ar: bestGuess }, { replace: true });
                    }
                }

            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setIsProcessing(false);
            }
        };

        generateScreenshots();
    }, [fileId, currentAspectRatio]);


    const handleAspectRatioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newAspectRatio = e.target.value;
        setSearchParams({ ar: newAspectRatio });
    }
    
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

    const renderControls = () => {
        return (
            <div style={{ margin: '20px 0', padding: '10px', border: '1px solid #ccc' }}>
                <h4>Manual Corrections</h4>
                 <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px', alignItems: 'center' }}>
                    <label htmlFor="aspectRatio">Aspect Ratio:</label>
                    <select id="aspectRatio" value={currentAspectRatio} onChange={handleAspectRatioChange} disabled={isProcessing}>
                        {ASPECT_RATIO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
            </div>
        );
      };

    return (
        <div>
            <p><Link to="/">← Back to File List</Link></p>
            <h1>Video Details</h1>
            <p><b>File:</b> {filePath}</p>

            {isProcessing && <p>Analyzing and generating screenshots...</p>}
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            
            {!isProcessing && (
                <>
                {renderMediaInfo()}
                {renderControls()}
                <div style={{ backgroundColor: '#eee', padding: '10px', margin: '10px 0' }}>
                    {cropResult && (
                    <p style={{ margin: 0, paddingBottom: deinterlaceReason ? '8px' : '0' }}>
                        <b>Auto Crop:</b> {cropResult.startsWith('crop=') 
                        ? `Detected and applied (${cropResult}).` 
                        : 'No crop detected.'}
                    </p>
                    )}
                    {deinterlaceReason && (
                    <div style={{fontSize: '0.9em', paddingTop: cropResult ? '8px' : '0'}}>
                        <b>Other Corrections:</b>
                        <span style={{display: 'block', marginLeft: '10px'}}>• Deinterlacing (Field Order: {deinterlaceReason})</span>
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
                            style={{ maxWidth: '100%', height: 'auto', border: '1px solid #ccc' }}
                        />
                        ))}
                    </div>
                    </div>
                )}
                </>
            )}
        </div>
    );
}