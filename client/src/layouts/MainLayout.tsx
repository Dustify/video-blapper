// client/src/layouts/MainLayout.tsx
import React from 'react';
import { EncodeQueue } from '../components/EncodeQueue';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="main-layout">
      <aside className="sidebar">
        <EncodeQueue />
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}