// client/src/App.tsx
import { Routes, Route } from 'react-router-dom';
import { FileListPage } from './pages/FileListPage';
import { VideoDetailPage } from './pages/VideoDetailPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<FileListPage />} />
      <Route path="/video/:fileId" element={<VideoDetailPage />} />
    </Routes>
  );
}

export default App;