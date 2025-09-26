// client/src/pages/FileListPage.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface MkvFile {
    filePath: string;
    id: string;
}

export function FileListPage() {
    const [mkvFiles, setMkvFiles] = useState<MkvFile[]>([]);
    const [isFetchingList, setIsFetchingList] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

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

    if (isFetchingList) return <p>Searching for MKV files...</p>;
    if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

    return (
        <div>
            <h1>video-blapper</h1>
            <h2>Select an MKV File 📂</h2>
            <ul>
                {mkvFiles.map(file => (
                <li key={file.id} style={{ margin: '8px 0' }}>
                    <Link to={`/video/${file.id}`}>
                        {file.filePath}
                    </Link>
                </li>
                ))}
            </ul>
        </div>
    );
}