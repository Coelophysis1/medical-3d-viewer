import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '医学3D模型系统 | Medical 3D Viewer',
    template: '%s | 医学3D模型系统',
  },
  description:
    '专业的医学3D模型可视化平台，支持STL格式文件上传、多模型配置、3D交互展示',
  keywords: [
    '医学3D模型',
    'STL可视化',
    '三维重建',
    '医学影像',
    '手术规划',
    '3D Viewer',
    'Medical Imaging',
    'CT三维重建',
  ],
  authors: [{ name: 'Medical 3D Platform' }],
  openGraph: {
    title: '医学3D模型系统 | Medical 3D Viewer',
    description:
      '专业的医学3D模型可视化平台，支持STL格式文件上传、多模型配置、3D交互展示',
    siteName: '医学3D模型系统',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
