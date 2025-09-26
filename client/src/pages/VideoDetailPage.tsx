// client/src/pages/VideoDetailPage.tsx
import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { type MkvFile } from '../App';

interface VideoDetailPageProps {
    mkvFiles: MkvFile[];
}

// ... (Keep all the interface definitions: StreamTags, MediaStream, etc.)
interface StreamTags {
    language?: string;
    title?: string;
  }
  
  interface MediaStream {
    index: number;
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

  interface CropDimensions {
    w: number;
    h: number;
    x: number;
    y: number;
  }
  
  interface VideoStreamInfo {
    width?: number;
    height?: number;
    sample_aspect_ratio?: string;
    cropDimensions?: CropDimensions | null;
  }

interface EncodingSettings {
    videoCodec: 'libx264' | 'libx265' | 'hevc_rkmpp';
    videoPreset: 'veryslow' | 'slower' | 'slow' | 'medium' | 'fast' | 'faster' | 'veryfast';
    videoCrf: number;
    rc_mode: number;
    qp_init: number;
    audioCodec: 'aac'; // Keep simple
    audioBitrate: string;
}
  
const ASPECT_RATIO_OPTIONS = ['None', '4:3', '16:9', '1.85:1', '2.00:1', '2.39:1'];


const getBestAspectRatio = (videoStream: VideoStreamInfo | null): string => {
    console.log('[getBestAspectRatio] Received video stream info:', videoStream);

    if (!videoStream?.width || !videoStream?.height) {
        console.log('[getBestAspectRatio] Missing width or height. Defaulting to None.');
        return ASPECT_RATIO_OPTIONS[0];
    }

    const { width, height, sample_aspect_ratio, cropDimensions } = videoStream;
    
    const displayWidth = cropDimensions ? cropDimensions.w : width;
    const displayHeight = cropDimensions ? cropDimensions.h : height;
    
    let sar = 1;
    if (sample_aspect_ratio && sample_aspect_ratio.includes(':')) {
        const [sarW, sarH] = sample_aspect_ratio.split(':').map(Number);
        if (sarW && sarH) sar = sarW / sarH;
    }
    console.log(`[getBestAspectRatio] Parsed values: displayWidth=${displayWidth}, displayHeight=${displayHeight}, sar=${sar}`);


    const calculatedDAR = (displayWidth / displayHeight) * sar;
    console.log(`[getBestAspectRatio] Calculated DAR: ${calculatedDAR}`);

    let closestOption = ASPECT_RATIO_OPTIONS[0];
    let smallestDiff = Infinity;

    const ratios: { [key: string]: number } = {
        '4:3': 4 / 3,
        '16:9': 16 / 9,
        '1.85:1': 1.85,
        '2.00:1': 2.00,
        '2.39:1': 2.39,
    };

    for (const option in ratios) {
        const diff = Math.abs(calculatedDAR - ratios[option]);
        console.log(`[getBestAspectRatio] Comparing with ${option} (${ratios[option].toFixed(3)}). Difference: ${diff.toFixed(3)}`);
        if (diff < smallestDiff) {
            smallestDiff = diff;
            closestOption = option;
        }
    }
    
    if (smallestDiff < 0.1) {
        console.log(`[getBestAspectRatio] Found closest match: ${closestOption}`);
        return closestOption;
    }
    
    console.log(`[getBestAspectRatio] No close match found. Defaulting to None.`);
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


export function VideoDetailPage({ mkvFiles }: VideoDetailPageProps) {
    const { fileId } = useParams<{ fileId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const [screenshots, setScreenshots] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [cropResult, setCropResult] = useState<string | null>(null);
    const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
    const [cacheBuster, setCacheBuster] = useState<number>(Date.now());
    const [deinterlaceReason, setDeinterlaceReason] = useState<string | null>(null);
    const [selectedAudioStreams, setSelectedAudioStreams] = useState<number[]>([]);
    const [encodingSettings, setEncodingSettings] = useState<EncodingSettings>({
        videoCodec: 'libx265',
        videoPreset: 'veryslow',
        videoCrf: 18,
        rc_mode: 2,
        qp_init: -1,
        audioCodec: 'aac',
        audioBitrate: '160k',
    });
    const [outputFilename, setOutputFilename] = useState('');
    
    const filePath = fileId ? atob(fileId) : null;
    const currentAspectRatio = searchParams.get('ar') || 'None';


    useEffect(() => {
        if (!filePath) return;

        const fetchDefaultsAndSetFilename = async () => {
            let filenameSetFromDefaults = false;
            // Fetch defaults
            try {
                const response = await fetch('/api/encode/defaults');
                if (response.ok) {
                    const { outputFilename: defaultFilename, ...defaultSettings } = await response.json();
                    setEncodingSettings(prev => ({ ...prev, ...defaultSettings }));
                    if (defaultFilename) {
                        setOutputFilename(defaultFilename);
                        filenameSetFromDefaults = true;
                    }
                }
            } catch (error) {
                console.error("Failed to fetch default encoding settings", error);
            }
            
            if (!filenameSetFromDefaults) {
                // Set default output filename from source file path
                const baseName = filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || '';
                setOutputFilename(baseName);
            }
        }
        fetchDefaultsAndSetFilename();
    }, [filePath]); // Re-run when filePath changes

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
                    const bestGuess = getBestAspectRatio(data.videoStream);
                    console.log(`[VideoDetailPage] Best guess for aspect ratio is: "${bestGuess}"`);
                    if (bestGuess !== 'None') {
                        setSearchParams({ ar: bestGuess }, { replace: true });
                    }
                }
                
                // Pre-select the first audio stream
                const firstAudioStream = data.mediaInfo?.streams.find((s: MediaStream) => s.codec_type === 'audio');
                if (firstAudioStream) {
                    setSelectedAudioStreams([firstAudioStream.index]);
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
    
    const handleAudioStreamChange = (streamIndex: number) => {
        setSelectedAudioStreams(prev =>
            prev.includes(streamIndex)
                ? prev.filter(index => index !== streamIndex)
                : [...prev, streamIndex]
        );
    };

    const handleEncodingSettingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEncodingSettings(prev => ({
            ...prev,
            [name]: ['videoCrf', 'rc_mode', 'qp_init'].includes(name) ? parseInt(value, 10) : value,
        }));
    };
    
    const handleAddToQueue = async () => {
        if (!filePath) return;
        try {
            const response = await fetch('/api/encode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filePath,
                    aspectRatio: currentAspectRatio,
                    audioStreams: selectedAudioStreams,
                    crop: cropResult?.startsWith('crop=') ? cropResult : null,
                    deinterlace: !!deinterlaceReason,
                    ...encodingSettings,
                    outputFilename,
                }),
            });

            if (!response.ok) {
                throw new Error('Server responded with an error.');
            }

            toast.success('Added to encode queue!');
            
            // Navigate to the next video
            const currentIndex = mkvFiles.findIndex(file => file.id === fileId);
            if (currentIndex !== -1 && currentIndex < mkvFiles.length - 1) {
                navigate(`/video/${mkvFiles[currentIndex + 1].id}`);
            }

        } catch (error) {
            console.error("Failed to add to queue", error);
            toast.error('Failed to add to queue.');
        }
    };
    
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
                     <div key={i}>
                        <input
                            type="checkbox"
                            id={`audio-${s.index}`}
                            checked={selectedAudioStreams.includes(s.index)}
                            onChange={() => handleAudioStreamChange(s.index)}
                        />
                        <label htmlFor={`audio-${s.index}`}>
                            <b>Audio ({s.index}):</b> {s.tags?.language?.toUpperCase()} {s.codec_name} ({s.channel_layout})
                        </label>
                    </div>
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

    const renderEncodingSettings = () => (
        <div style={{ margin: '20px 0', padding: '10px', border: '1px solid #ccc' }}>
            <h4>Encoding Settings</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px', alignItems: 'center' }}>
                <label htmlFor="outputFilename">Output Filename:</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                        type="text"
                        id="outputFilename"
                        name="outputFilename"
                        value={outputFilename}
                        onChange={(e) => setOutputFilename(e.target.value)}
                        style={{ flexGrow: 1 }}
                    />
                    <span style={{ marginLeft: '8px' }}>.mp4</span>
                </div>

                <label htmlFor="videoCodec">Video Codec:</label>
                <select id="videoCodec" name="videoCodec" value={encodingSettings.videoCodec} onChange={handleEncodingSettingChange}>
                    <option value="libx264">x264</option>
                    <option value="libx265">x265</option>
                    <option value="hevc_rkmpp">hevc_rkmpp (Hardware)</option>
                </select>
                
                {(encodingSettings.videoCodec === 'libx264' || encodingSettings.videoCodec === 'libx265') && (
                    <>
                        <label htmlFor="videoPreset">Preset:</label>
                        <select id="videoPreset" name="videoPreset" value={encodingSettings.videoPreset} onChange={handleEncodingSettingChange}>
                            {['veryslow', 'slower', 'slow', 'medium', 'fast', 'faster', 'veryfast'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>

                        <label htmlFor="videoCrf">CRF:</label>
                        <input
                            type="number"
                            id="videoCrf"
                            name="videoCrf"
                            value={encodingSettings.videoCrf}
                            onChange={handleEncodingSettingChange}
                            min="0" max="51"
                        />
                    </>
                )}

                {encodingSettings.videoCodec === 'hevc_rkmpp' && (
                    <>
                        <label htmlFor="rc_mode">RC Mode:</label>
                        <input
                            type="number"
                            id="rc_mode"
                            name="rc_mode"
                            value={encodingSettings.rc_mode}
                            onChange={handleEncodingSettingChange}
                        />

                        <label htmlFor="qp_init">QP Init:</label>
                        <input
                            type="number"
                            id="qp_init"
                            name="qp_init"
                            value={encodingSettings.qp_init}
                            onChange={handleEncodingSettingChange}
                        />
                    </>
                )}
                
                <label>Audio Codec:</label>
                <span>{encodingSettings.audioCodec}</span>
                
                <label htmlFor="audioBitrate">Audio Bitrate:</label>
                <input
                    type="text"
                    id="audioBitrate"
                    name="audioBitrate"
                    value={encodingSettings.audioBitrate}
                    onChange={handleEncodingSettingChange}
                />
            </div>
        </div>
    );
    
    const renderNavigation = (style: React.CSSProperties = {}) => {
        const currentIndex = mkvFiles.findIndex(file => file.id === fileId);
        if (currentIndex === -1) return null;

        const prevFile = currentIndex > 0 ? mkvFiles[currentIndex - 1] : null;
        const nextFile = currentIndex < mkvFiles.length - 1 ? mkvFiles[currentIndex + 1] : null;

        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', ...style }}>
                {prevFile ? (
                    <Link to={`/video/${prevFile.id}`}>← Previous</Link>
                ) : (
                    <span style={{ color: '#888', cursor: 'not-allowed' }}>← Previous</span>
                )}
                {nextFile ? (
                    <Link to={`/video/${nextFile.id}`}>Next →</Link>
                ) : (
                    <span style={{ color: '#888', cursor: 'not-allowed' }}>Next →</span>
                )}
            </div>
        );
    };

    return (
        <div>
            <p><Link to="/">← Back to File List</Link></p>
            {renderNavigation({ marginBottom: '20px' })}
            <h1>Video Details</h1>
            <p><b>File:</b> {filePath}</p>

            {isProcessing && <p>Analyzing and generating screenshots...</p>}
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            
            {!isProcessing && (
                <>
                {renderMediaInfo()}
                {renderControls()}
                {renderEncodingSettings()}
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
                 <button onClick={handleAddToQueue} disabled={isProcessing || selectedAudioStreams.length === 0 || !outputFilename}>
                    Add to Encode Queue
                </button>
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
                 {renderNavigation({ marginTop: '20px' })}
                </>
            )}
        </div>
    );
}