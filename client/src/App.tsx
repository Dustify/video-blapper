// client/src/App.tsx
import { Routes, Route } from 'react-router-dom';
import { FileListPage } from './pages/FileListPage';
import { VideoDetailPage } from './pages/VideoDetailPage';
import { MainLayout } from './layouts/MainLayout';
import './App.css';

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<FileListPage />} />
        <Route path="/video/:fileId" element={<VideoDetailPage />} />
      </Routes>
    </MainLayout>
  );
}

export default App;