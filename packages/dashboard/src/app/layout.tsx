/**
 * Root layout — AgentGuard Dashboard
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AgentGuard — Runtime Security for AI Agents',
  description: 'Monitor, control, and audit your AI agents in real-time.',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
