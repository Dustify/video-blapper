// client/src/App.tsx
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { FileListPage } from './pages/FileListPage';
import { VideoDetailPage } from './pages/VideoDetailPage';
import { MainLayout } from './layouts/MainLayout.tsx';
import './App.css';

function App() {
  return (
    <MainLayout>
      <Toaster position="bottom-right" />
      <Routes>
        <Route path="/" element={<FileListPage />} />
        <Route path="/video/:fileId" element={<VideoDetailPage />} />
      </Routes>
    </MainLayout>
  );
}

export default App;