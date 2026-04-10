import './globals.css'

export const metadata = {
  title: '지점별 리드타임 분포',
  description: 'Handys 호텔 지점별 예약 리드타임 분포 대시보드',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="bg-slate-950 text-slate-200 min-h-screen">{children}</body>
    </html>
  )
}
