'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

export default function AdminPage() {
  const [status, setStatus] = useState('idle') // idle | parsing | uploading | done | error
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)

  const handleFile = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setStatus('parsing')
    setMessage('파일 분석 중...')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false })

        // 컬럼 매핑
        const mapped = rows
          .filter(r => r['예약번호'] && r['체크인날짜'])
          .map(r => ({
            booking_id:    r['예약번호'],
            channel:       r['채널'] || '',
            property:      r['지점'] || '',
            room_type:     r['객실타입'] || '',
            booked_at:     r['예약날짜'] || null,
            checkin_date:  r['체크인날짜'] || null,
            checkout_date: r['체크아웃날짜'] || null,
            amount:        Number(r['예약금액']) || 0,
            nights:        Number(r['숙박일수']) || 1,
            lead_time:     Number(r['리드타임']) || 0,
          }))

        setPreview({ total: mapped.length, sample: mapped.slice(0, 3), data: mapped })
        setStatus('ready')
        setMessage(`총 ${mapped.length.toLocaleString()}건 확인됨`)
      } catch (err) {
        setStatus('error')
        setMessage('파일 파싱 실패: ' + err.message)
      }
    }
    reader.readAsBinaryString(f)
  }

  const handleUpload = async () => {
    if (!preview?.data) return
    setStatus('uploading')
    setMessage('Supabase에 업로드 중...')

    try {
      const CHUNK = 500
      const data = preview.data
      let uploaded = 0

      for (let i = 0; i < data.length; i += CHUNK) {
        const chunk = data.slice(i, i + CHUNK)
        const { error } = await supabase
          .from('sales_raw')
          .upsert(chunk, { onConflict: 'booking_id' })

        if (error) throw error
        uploaded += chunk.length
        setMessage(`업로드 중... ${uploaded.toLocaleString()} / ${data.length.toLocaleString()}건`)
      }

      setStatus('done')
      setMessage(`✅ ${data.length.toLocaleString()}건 업로드 완료! 대시보드에 반영됩니다.`)
      setPreview(null)
    } catch (err) {
      setStatus('error')
      setMessage('업로드 실패: ' + err.message)
    }
  }

  const statusColor = { idle:'#94a3b8', parsing:'#f59e0b', ready:'#6366f1', uploading:'#0ea5e9', done:'#10b981', error:'#ef4444' }[status]

  return (
    <div style={{ minHeight:'100vh', background:'#f1f5f9', fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif", padding:'40px 36px' }}>
      <div style={{ maxWidth:700, margin:'0 auto' }}>

        {/* 헤더 */}
        <div style={{ marginBottom:32 }}>
          <a href="/" style={{ fontSize:12, color:'#6366f1', fontWeight:700, textDecoration:'none' }}>← 대시보드로 돌아가기</a>
          <h1 style={{ margin:'12px 0 4px', fontSize:24, fontWeight:800, color:'#0f172a' }}>📤 판매 데이터 업로드</h1>
          <p style={{ color:'#64748b', fontSize:13 }}>엑셀 파일을 업로드하면 DB가 업데이트되고 대시보드에 즉시 반영됩니다.</p>
        </div>

        {/* 업로드 박스 */}
        <div style={{ background:'#fff', borderRadius:16, border:'2px dashed #e2e8f0', padding:'40px 32px', textAlign:'center', marginBottom:24, cursor:'pointer', transition:'border-color 0.2s' }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) handleFile({target:{files:[f]}}) }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📊</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#374151', marginBottom:8 }}>엑셀 파일을 여기에 드래그하거나</div>
          <label style={{ display:'inline-block', padding:'10px 24px', background:'#6366f1', color:'#fff', borderRadius:9, fontWeight:700, fontSize:13, cursor:'pointer' }}>
            파일 선택
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display:'none' }} />
          </label>
          <div style={{ fontSize:11, color:'#94a3b8', marginTop:12 }}>지원 형식: .xlsx, .xls · 필수 컬럼: 예약번호, 지점, 체크인날짜, 예약금액, 리드타임</div>
        </div>

        {/* 상태 메시지 */}
        {message && (
          <div style={{ background:'#fff', borderRadius:12, padding:'16px 20px', marginBottom:20, borderLeft:`4px solid ${statusColor}`, fontSize:13, color:'#374151', fontWeight:600 }}>
            <span style={{ color:statusColor }}>●</span> {message}
          </div>
        )}

        {/* 미리보기 */}
        {preview && status === 'ready' && (
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e2e8f0', padding:'24px', marginBottom:24 }}>
            <div style={{ fontSize:15, fontWeight:800, color:'#0f172a', marginBottom:16 }}>미리보기 (처음 3건)</div>
            <div style={{ overflowX:'auto', marginBottom:20 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:'#f8fafc' }}>
                    {['예약번호','지점','체크인','금액','리드타임'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#64748b', fontWeight:700, borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'8px 12px', fontFamily:"'DM Mono',monospace", color:'#374151' }}>{r.booking_id?.slice(0,12)}...</td>
                      <td style={{ padding:'8px 12px', color:'#374151' }}>{r.property}</td>
                      <td style={{ padding:'8px 12px', fontFamily:"'DM Mono',monospace" }}>{r.checkin_date}</td>
                      <td style={{ padding:'8px 12px', fontFamily:"'DM Mono',monospace" }}>{Number(r.amount).toLocaleString()}원</td>
                      <td style={{ padding:'8px 12px', fontFamily:"'DM Mono',monospace" }}>D-{r.lead_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={handleUpload} style={{ width:'100%', padding:'14px', background:'#6366f1', color:'#fff', border:'none', borderRadius:10, fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
              {preview.total.toLocaleString()}건 DB에 업로드하기 →
            </button>
          </div>
        )}

        {status === 'uploading' && (
          <div style={{ background:'#fff', borderRadius:12, padding:'32px', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#374151' }}>{message}</div>
          </div>
        )}

        {status === 'done' && (
          <div style={{ background:'#f0fdf4', borderRadius:12, padding:'24px', textAlign:'center', border:'1px solid #10b98133' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:800, color:'#065f46', marginBottom:12 }}>{message}</div>
            <a href="/" style={{ display:'inline-block', padding:'10px 24px', background:'#10b981', color:'#fff', borderRadius:9, fontWeight:700, textDecoration:'none' }}>대시보드 확인하기 →</a>
          </div>
        )}

        {/* 사용 가이드 */}
        <div style={{ background:'#0f172a', borderRadius:16, padding:'24px 28px', marginTop:24 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#7dd3fc', marginBottom:16, textTransform:'uppercase', letterSpacing:1 }}>업로드 가이드</div>
          {[
            ['📋 엑셀 컬럼 확인', '예약번호, 채널, 상품명, 지점, 객실타입, 예약날짜, 체크인날짜, 체크아웃날짜, 예약금액, 숙박일수, 리드타임'],
            ['🔄 중복 처리', '같은 예약번호는 자동으로 덮어씁니다. 전체 재업로드해도 OK.'],
            ['📅 업데이트 주기', '월 1회 또는 분기별로 최신 데이터 업로드 권장'],
          ].map(([title, desc], i) => (
            <div key={i} style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#f1f5f9', marginBottom:3 }}>{title}</div>
              <div style={{ fontSize:11, color:'#64748b', lineHeight:1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
