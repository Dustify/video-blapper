// client/src/pages/FileListPage.tsx
import { Link } from 'react-router-dom';
import { type MkvFile } from '../App';

interface FileListPageProps {
    mkvFiles: MkvFile[];
    isFetchingList: boolean;
    error: string | null;
}

export function FileListPage({ mkvFiles, isFetchingList, error }: FileListPageProps) {
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