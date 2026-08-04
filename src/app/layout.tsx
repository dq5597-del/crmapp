import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '光輝影音科技 行政系統',
  description: '光輝影音科技行政管理系統',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '光輝行政系統',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <head>
        {/* 介面縮放：在「首次繪製前」就套用使用者存的比例，避免畫面先跳 100% 再縮。
            gh-ui-scale 由 ViewModeSwitch（介面縮放）寫入；未設或 1 → 不動。
            同時清掉舊版 gh-view-mode / gh-devices（改寫 viewport 寬度的做法已移除）。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{localStorage.removeItem('gh-view-mode');localStorage.removeItem('gh-devices');var s=parseFloat(localStorage.getItem('gh-ui-scale'));if(!s||isNaN(s))return;if(s<0.6)s=0.6;if(s>1.4)s=1.4;var e=document.documentElement;e.style.setProperty('--gh-ui-scale',String(s));if(s!==1)e.style.zoom=String(s)}catch(e){}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
