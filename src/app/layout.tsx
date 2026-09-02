import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import SideBar from '@/components/SideBar';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Civillist - Meeting Management',
  description: 'Professional meeting management system for civil servants',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen bg-gray-50">
          {/* Sidebar */}
          <SideBar />
          
          {/* Main Content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}