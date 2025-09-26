// client/src/layouts/MainLayout.tsx
import React from 'react';
import { EncodeQueue } from '../components/EncodeQueue';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="main-layout">
      <main className="main-content">
        {children}
      </main>
      <aside className="sidebar">
        <EncodeQueue />
      </aside>
    </div>
  );
}