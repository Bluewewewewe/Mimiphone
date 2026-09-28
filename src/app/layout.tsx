import type { Metadata, Viewport } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '米米宇宙',
    template: '%s | 米米宇宙',
  },
  description:
    '米米宇宙 — AI 小手机 V4，一个温馨有趣的虚拟家庭互动空间。',
  keywords: [
    '米米宇宙',
    'AI 小手机',
    '虚拟家庭',
    '互动空间',
  ],
  authors: [{ name: '米米宇宙', url: 'https://code.coze.cn' }],
  generator: 'Coze Code',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📱</text></svg>',
  },
  openGraph: {
    title: '米米宇宙',
    description:
      '米米宇宙 — AI 小手机 V4，一个温馨有趣的虚拟家庭互动空间。',
    url: 'https://code.coze.cn',
    siteName: '米米宇宙',
    locale: 'zh_CN',
    type: 'website',
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'Coze Code | Your AI Engineer is Here',
  //   description:
  //     'Build and deploy full-stack applications through AI conversation. No env setup, just flow.',
  //   // images: [''],
  // },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="en">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
