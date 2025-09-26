// client/src/App.tsx
import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { FileListPage } from './pages/FileListPage';
import { VideoDetailPage } from './pages/VideoDetailPage';
import { MainLayout } from './layouts/MainLayout.tsx';
import './App.css';

export interface MkvFile {
    filePath: string;
    id: string;
}

function App() {
  const [mkvFiles, setMkvFiles] = useState<MkvFile[]>([]);
  const [isFetchingList, setIsFetchingList] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/mkv-files')
      .then(res => {
        if (!res.ok) {
            throw new Error('Network response was not ok');
        }
        return res.json();
      })
      .then(data => setMkvFiles(data.files))
      .catch(err => {
        setError('Failed to fetch MKV files. Is the server running?');
        console.error(err);
      })
      .finally(() => setIsFetchingList(false));
  }, []);


  return (
    <MainLayout>
      <Toaster position="bottom-right" />
      <Routes>
        <Route path="/" element={
            <FileListPage 
                mkvFiles={mkvFiles} 
                isFetchingList={isFetchingList}
                error={error}
            />} 
        />
        <Route path="/video/:fileId" element={
            <VideoDetailPage mkvFiles={mkvFiles} />} 
        />
      </Routes>
    </MainLayout>
  );
}

export default App;