import './globals.css'

export const metadata = {
  title: '스마트 프라이싱 엔진',
  description: '3년 실데이터 기반 지점별 요금 최적화',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
