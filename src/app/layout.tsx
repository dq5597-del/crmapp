import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '光輝影音科技 CRM',
  description: '光輝影音科技業務管理系統',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '光輝CRM',
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
      <body>
        {/* 版型顯示：在「載入當下」就套用使用者選的固定寬度（手機/平板/PWA app 唯一可靠的時機）。
            gh-view-mode 由 ViewModeSwitch 寫入；'auto' 或未設 → 沿用 device-width，不覆蓋。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=localStorage.getItem('gh-view-mode');if(!m||m==='auto')return;var w=null;if(m==='mobile')w=390;else if(m==='tablet')w=820;else if(m==='desktop')w=1280;else if(m.indexOf('dev:')===0){var ds=JSON.parse(localStorage.getItem('gh-devices')||'[]');var d=ds.find(function(x){return 'dev:'+x.id===m});if(d)w=d.width}if(w){var v=document.querySelector('meta[name=viewport]');if(!v){v=document.createElement('meta');v.setAttribute('name','viewport');document.head.appendChild(v)}v.setAttribute('content','width='+w)}}catch(e){}})();",
          }}
        />
        {children}
      </body>
    </html>
  )
}
