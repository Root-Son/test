'use client'
import { useState, useMemo, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { supabase } from '../lib/supabase'
import {
  PROP_NAMES, LEAD_BANDS, OCC_BANDS, DATE_TYPES, DATE_TYPE_COLORS,
  BASE_MATRIX, PROPERTIES_DATA, PROPERTY_INSIGHTS, PACE_DETAIL, PACE_BY_ROOMTYPE
} from '../lib/analysisData'

const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v))
const calcPrice = (adr, lk, ok, mx, minP, maxP) => {
  if (!adr || !minP || !maxP) return null
  return clamp(Math.round(adr * (mx[lk]?.[ok] ?? 1) / 1000) * 1000, minP, maxP)
}
const getADR = (revPAR, dt, dtMult) => revPAR ? Math.round((revPAR / 0.75) * (dtMult[dt] ?? 1)) : null
const ratioColor = (r) => r >= 1.15 ? '#0ea5e9' : r >= 1.05 ? '#6366f1' : r >= 0.95 ? '#f59e0b' : '#ef4444'
const fmtW = (v) => v ? `${(v / 10000).toFixed(1)}만` : '-'

const makeRoomTypes = (propName) => {
  const types = PROPERTIES_DATA[propName]?.roomTypes || ['스탠다드', '디럭스', '스위트']
  return types.map((name, i) => ({ id: `r${i}`, name, rooms: 10, targetRevPAR: '', minPrice: 0, maxPrice: 0 }))
}

// ── 서브 컴포넌트 ────────────────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 22px', ...style }}>{children}</div>
)
const Head = ({ icon, title, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{icon} {title}</div>
    {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
  </div>
)
const Mono = ({ children, size = 13, color }) => (
  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: size, color }}>{children}</span>
)
const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0f172a', color: '#f1f5f9', padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.9 }}>
      {label && <div style={{ color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>{label}</div>}
      {payload.map((p, i) => <div key={i}><span style={{ color: p.color || p.fill }}>●</span> {p.name}: <b>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</b></div>)}
    </div>
  )
}
const InsightBar = ({ propName }) => {
  const items = PROPERTY_INSIGHTS[propName] || []
  const icons = ['📊', '⏱️', '💡']
  const colors = ['#6366f1', '#0ea5e9', '#f59e0b']
  return (
    <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, border: '1px solid #334155' }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: '#475569', textTransform: 'uppercase', fontFamily: "'DM Mono',monospace", marginBottom: 12 }}>BOOKING PACE INSIGHT · 3년 실데이터 기반</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {items.map((text, i) => {
          const [title, desc] = text.includes(' — ') ? text.split(' — ') : [text, '']
          return (
            <div key={i} style={{ background: `${colors[i]}10`, border: `1px solid ${colors[i]}30`, borderLeft: `3px solid ${colors[i]}`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors[i], marginBottom: desc ? 4 : 0, lineHeight: 1.5 }}>{icons[i]} {title}</div>
              {desc && <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>{desc}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 메인 ────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [propName, setPropName] = useState(PROP_NAMES[0])
  const [roomTypes, setRoomTypes] = useState(() => Object.fromEntries(PROP_NAMES.map(p => [p, makeRoomTypes(p)])))
  const [roomId, setRoomId] = useState('r0')
  const [dateTypes, setDateTypes] = useState('평일')
  const [months, setMonths] = useState(null)
  const toggleDT = (dt) => setDateTypes(dt)
  const toggleMonth = (m) => setMonths(prev => prev === m ? null : m)
  const [matrix, setMatrix] = useState(BASE_MATRIX)
  const [tab, setTab] = useState('pace')
  const [liveOCC, setLiveOCC] = useState(35)
  const [liveDays, setLiveDays] = useState(20)

  // 지점 변경 시 첫 번째 룸타입으로 초기화
  const handlePropChange = (p) => {
    setPropName(p)
    setRoomId('r0')
  }

  const prop = PROPERTIES_DATA[propName]
  const rooms = roomTypes[propName]
  const room = rooms?.find(r => r.id === roomId) || rooms?.[0]
  const revPAR = room?.targetRevPAR
  const hasRevPAR = revPAR && revPAR > 0
  const dateType = dateTypes || '평일'
  const baseADR = useMemo(() => getADR(revPAR, dateType, prop.dtMult), [revPAR, dateType, prop])

  const priceTable = useMemo(() => {
    if (!hasRevPAR || !room) return {}
    const t = {}
    LEAD_BANDS.forEach(lb => {
      t[lb.key] = {}
      OCC_BANDS.forEach(ob => { t[lb.key][ob.key] = calcPrice(baseADR, lb.key, ob.key, matrix, room.minPrice, room.maxPrice) })
    })
    return t
  }, [baseADR, matrix, room, hasRevPAR])

  const simResults = useMemo(() => {
    if (!hasRevPAR || !room) return []
    const w = { L1: { O1: .06, O2: .04, O3: .03, O4: .02, O5: .01, O6: .01 }, L2: { O1: .04, O2: .07, O3: .06, O4: .04, O5: .02, O6: .02 }, L3: { O1: .02, O2: .04, O3: .07, O4: .06, O5: .04, O6: .02 }, L4: { O1: .01, O2: .02, O3: .04, O4: .06, O5: .05, O6: .03 }, L5: { O1: .00, O2: .01, O3: .02, O4: .03, O5: .04, O6: .04 } }
    return DATE_TYPES.map(dt => {
      const adr = getADR(revPAR, dt, prop.dtMult)
      let rev = 0, ws = 0
      LEAD_BANDS.forEach(lb => OCC_BANDS.forEach(ob => {
        const wi = w[lb.key][ob.key]
        const p = calcPrice(adr, lb.key, ob.key, matrix, room.minPrice, room.maxPrice)
        if (p) { rev += p * wi; ws += wi }
      }))
      const simRevPAR = Math.round(rev)
      const targetRevPAR = Math.round(Number(revPAR) * (prop.dtMult[dt] ?? 1))
      return { dt, simRevPAR, targetRevPAR, pct: targetRevPAR > 0 ? Math.round(simRevPAR / targetRevPAR * 100) : 0 }
    })
  }, [revPAR, room, prop, matrix, hasRevPAR])

  const liveLead = liveDays > 60 ? 'L1' : liveDays > 30 ? 'L2' : liveDays > 14 ? 'L3' : liveDays > 3 ? 'L4' : 'L5'
  const liveOCCKey = liveOCC < 10 ? 'O1' : liveOCC < 30 ? 'O2' : liveOCC < 50 ? 'O3' : liveOCC < 70 ? 'O4' : liveOCC < 90 ? 'O5' : 'O6'
  const livePrice = hasRevPAR && room ? calcPrice(baseADR, liveLead, liveOCCKey, matrix, room.minPrice, room.maxPrice) : null
  const liveTargetOCC = prop.targetOCC[dateType]?.[liveLead] ?? 0
  const paceDiff = liveOCC - liveTargetOCC

  const updMatrix = (lk, ok, d) => setMatrix(p => ({ ...p, [lk]: { ...p[lk], [ok]: clamp(Math.round((p[lk][ok] + d) * 100) / 100, 0.5, 1.5) } }))

  const inputProgress = PROP_NAMES.map(p => ({
    name: p,
    filled: roomTypes[p].filter(r => r.targetRevPAR && r.targetRevPAR > 0).length,
    total: roomTypes[p].length
  }))

  const TABS = [
    { id: 'pace', label: '📈 페이스 분석' },
    { id: 'revpar', label: '✏️ RevPAR 입력' },
    { id: 'table', label: '📋 요금 테이블' },
    { id: 'simulate', label: '📊 RevPAR 시뮬' },
    { id: 'live', label: '⚡ 실시간 조회' },
  ]

  const PACE_BANDS = ['D-0', 'D-1~10', 'D-11~30', 'D-31~60', 'D-61~90', 'D-90+']
  const PACE_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#0ea5e9', '#6366f1']

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif" }}>

      {/* ── 헤더 ── */}
      <div style={{ background: '#0f172a', padding: '20px 32px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* 타이틀 + 업로드 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: '#475569', fontFamily: "'DM Mono',monospace", textTransform: 'uppercase', marginBottom: 4 }}>
                Handys · 3년 실데이터 기반
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f8fafc', letterSpacing: -0.5 }}>
                Pricing 전략
              </h1>
            </div>
            <a href="/admin" style={{ padding: '8px 16px', borderRadius: 8, background: '#1e293b', color: '#94a3b8', fontSize: 12, fontWeight: 700, textDecoration: 'none', border: '1px solid #334155' }}>
              📤 데이터 업로드
            </a>
          </div>

          {/* 지점 탭 — 두 줄로 깔끔하게 */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingBottom: 0 }}>
            {[...PROP_NAMES].sort((a,b) => a.localeCompare(b, 'ko')).map(p => {
              const prog = inputProgress.find(x => x.name === p)
              const isDone = prog.filled === prog.total && prog.total > 0
              const isActive = propName === p
              return (
                <button key={p} onClick={() => handlePropChange(p)} style={{
                  padding: '6px 12px', borderRadius: '6px 6px 0 0',
                  border: 'none', cursor: 'pointer',
                  fontWeight: isActive ? 800 : 600, fontSize: 12, fontFamily: 'inherit',
                  background: isActive ? '#f1f5f9' : 'rgba(255,255,255,0.07)',
                  color: isActive ? '#0f172a' : '#64748b',
                  whiteSpace: 'nowrap',
                }}>
                  {PROPERTIES_DATA[p].emoji} {p.replace(/점$/, '')}
                  {isDone && <span style={{ marginLeft: 3, color: '#10b981' }}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── 본문 ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 32px' }}>

        {/* 컨트롤 바 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap', background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>객실:</span>
          {rooms?.map(r => {
            const hasPAR = r.targetRevPAR && r.targetRevPAR > 0
            const isActive = room?.id === r.id
            return (
              <button key={r.id} onClick={() => setRoomId(r.id)} style={{
                padding: '5px 12px', borderRadius: 7,
                border: `1.5px solid ${isActive ? '#6366f1' : hasPAR ? '#10b98155' : '#fbbf2455'}`,
                background: isActive ? '#eef2ff' : hasPAR ? '#f0fdf4' : '#fffbeb',
                color: isActive ? '#6366f1' : hasPAR ? '#065f46' : '#92400e',
                fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {r.name}{!hasPAR && ' ✏️'}
              </button>
            )
          })}

          {hasRevPAR && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>기준 ADR: <Mono>{baseADR?.toLocaleString()}원</Mono></span>}
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 16px', borderRadius: 9,
              border: `1.5px solid ${tab === t.id ? '#6366f1' : '#e2e8f0'}`,
              background: tab === t.id ? '#6366f1' : '#fff',
              color: tab === t.id ? '#fff' : '#64748b',
              fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── RevPAR 입력 ── */}
        {tab === 'revpar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 40 }}>{prop.emoji}</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{propName}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{prop.type}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    {DATE_TYPES.map(dt => <span key={dt} style={{ fontSize: 11, color: DATE_TYPE_COLORS[dt] }}>{dt} ×{prop.dtMult[dt]}</span>)}
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>— 3년 실데이터 기반</span>
                  </div>
                </div>
              </div>
              <InsightBar propName={propName} />
              <Head icon="✏️" title="목표 RevPAR 입력 (평일 기준)" sub="입력하면 요금 테이블 전체가 즉시 계산됩니다. 주말·연휴는 날짜유형 배율 자동 적용." />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {rooms?.map(r => {
                  const hasPAR = r.targetRevPAR && r.targetRevPAR > 0
                  return (
                    <div key={r.id} style={{ border: `1.5px solid ${hasPAR ? '#10b981' : '#fbbf24'}`, borderRadius: 12, padding: 16, background: hasPAR ? '#f0fdf4' : '#fffbeb' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>목표 RevPAR (평일, 원)</div>
                      <input type="number" value={r.targetRevPAR} placeholder="입력"
                        onChange={e => setRoomTypes(prev => ({ ...prev, [propName]: prev[propName].map(x => x.id === r.id ? { ...x, targetRevPAR: e.target.value === '' ? '' : Number(e.target.value) } : x) }))}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `2px solid ${hasPAR ? '#10b981' : '#fbbf24'}`, fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700, background: hasPAR ? '#fff' : '#fff', color: '#0f172a', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                      {hasPAR && <div style={{ fontSize: 10, color: '#10b981', marginTop: 3, textAlign: 'right' }}>ADR ≈ {Math.round(Number(r.targetRevPAR) / 0.75 / 1000)}K원</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                        {[{ label: '최저가', field: 'minPrice' }, { label: '최고가', field: 'maxPrice' }].map(f => (
                          <div key={f.field}>
                            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginBottom: 3 }}>{f.label}</div>
                            <input type="number" value={r[f.field]} step={1000}
                              onChange={e => setRoomTypes(prev => ({ ...prev, [propName]: prev[propName].map(x => x.id === r.id ? { ...x, [f.field]: Number(e.target.value) } : x) }))}
                              style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1.5px solid #e2e8f0', fontFamily: "'DM Mono',monospace", fontSize: 11, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ── 요금 테이블 ── */}
        {tab === 'table' && (
          <div>
            <InsightBar propName={propName} />
            <Card>
              {!hasRevPAR ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <div style={{ fontSize: 40 }}>✏️</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginTop: 12 }}>목표 RevPAR를 먼저 입력해주세요</div>
                  <button onClick={() => setTab('revpar')} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 9, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>RevPAR 입력하러 가기 →</button>
                </div>
              ) : (
                <>
                  <Head icon="📋" title={`${propName} · ${room?.name} · ${dateType} 요금 테이블`} sub="OCC 높을수록 가격 UP / 리드타임 가깝고 OCC 낮을수록 가격 DOWN" />
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#94a3b8' }}>리드타임 ↓ / OCC →</th>
                          {OCC_BANDS.map(ob => <th key={ob.key} style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: '#64748b', fontWeight: 700 }}>{ob.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {LEAD_BANDS.map(lb => {
                          const tgtOCC = prop.targetOCC[dateType]?.[lb.key] ?? 0
                          return (
                            <tr key={lb.key}>
                              <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{lb.labelFull}</div>
                                <div style={{ fontSize: 10, color: '#6366f1' }}>목표 OCC {tgtOCC}%</div>
                              </td>
                              {OCC_BANDS.map(ob => {
                                const ratio = matrix[lb.key][ob.key]
                                const price = priceTable[lb.key]?.[ob.key]
                                const c = ratioColor(ratio)
                                const clamped = price !== null && (price <= room?.minPrice || price >= room?.maxPrice)
                                return (
                                  <td key={ob.key} style={{ padding: 3 }}>
                                    <div style={{ background: `${c}12`, border: `1.5px solid ${c}33`, borderRadius: 9, padding: '8px 5px', textAlign: 'center', outline: clamped ? `2px dashed ${c}66` : 'none' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, marginBottom: 4 }}>
                                        <button onClick={() => updMatrix(lb.key, ob.key, -0.01)} style={{ width: 16, height: 16, borderRadius: 4, border: 'none', background: `${c}22`, color: c, cursor: 'pointer', fontSize: 13, padding: 0 }}>−</button>
                                        <Mono size={11} color={c}>{(ratio * 100).toFixed(0)}%</Mono>
                                        <button onClick={() => updMatrix(lb.key, ob.key, 0.01)} style={{ width: 16, height: 16, borderRadius: 4, border: 'none', background: `${c}22`, color: c, cursor: 'pointer', fontSize: 13, padding: 0 }}>+</button>
                                      </div>
                                      <Mono size={12} color="#0f172a">{fmtW(price)}</Mono>
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </div>
        )}

        {/* ── RevPAR 시뮬 ── */}
        {tab === 'simulate' && (
          !hasRevPAR ? (
            <Card><div style={{ textAlign: 'center', padding: '60px 0' }}><div style={{ fontSize: 40 }}>📊</div><div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginTop: 12 }}>목표 RevPAR를 먼저 입력해주세요</div><button onClick={() => setTab('revpar')} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 9, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>RevPAR 입력 →</button></div></Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                {simResults.map(sr => {
                  const c = sr.pct >= 100 ? '#10b981' : sr.pct >= 90 ? '#f59e0b' : '#ef4444'
                  const dtc = DATE_TYPE_COLORS[sr.dt]
                  return (
                    <Card key={sr.dt} style={{ borderTop: `4px solid ${dtc}` }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: dtc, marginBottom: 14 }}>{sr.dt}</div>
                      {[['목표 RevPAR', sr.targetRevPAR], ['예상 RevPAR', sr.simRevPAR]].map(([l, v], i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                          <span>{l}</span><Mono size={12} color={i === 1 ? c : undefined}>{v?.toLocaleString()}원</Mono>
                        </div>
                      ))}
                      <div style={{ background: '#f1f5f9', borderRadius: 99, height: 8, overflow: 'hidden', marginTop: 10 }}>
                        <div style={{ width: `${Math.min(100, sr.pct)}%`, height: '100%', background: c, borderRadius: 99 }} />
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 800, color: c, marginTop: 6 }}>{sr.pct}%</div>
                    </Card>
                  )
                })}
              </div>
              <Card>
                <Head icon="📊" title="날짜 유형별 목표 vs 예상 RevPAR" />
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={simResults.map(s => ({ name: s.dt, '목표': s.targetRevPAR, '예상': s.simRevPAR }))} barGap={6}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" /><YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip content={<TT />} /><Legend />
                    <Bar dataKey="목표" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="예상" radius={[4, 4, 0, 0]}>{simResults.map((s, i) => <Cell key={i} fill={s.pct >= 100 ? '#10b981' : s.pct >= 90 ? '#f59e0b' : '#ef4444'} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )
        )}

        {/* ── 실시간 조회 ── */}
        {tab === 'live' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Card>
              <Head icon="⚡" title="실시간 요금 조회" sub="현재 OCC + 남은 일수 → CM push 요금 즉시 산출" />
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>체크인까지: <Mono size={15}>{liveDays}일</Mono> <span style={{ fontSize: 11, color: '#6366f1' }}>{LEAD_BANDS.find(l => l.key === liveLead)?.labelFull}</span></div>
                <input type="range" min={0} max={90} value={liveDays} onChange={e => setLiveDays(Number(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
              </div>
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>현재 OCC: <Mono size={15}>{liveOCC}%</Mono></div>
                <input type="range" min={0} max={100} value={liveOCC} onChange={e => setLiveOCC(Number(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
              </div>
              <div style={{ borderRadius: 10, padding: '14px 16px', background: liveOCC >= 88 ? '#fefce8' : paceDiff >= 5 ? '#f0fdf4' : paceDiff >= -5 ? '#f8fafc' : '#fef2f2', border: `1.5px solid ${liveOCC >= 88 ? '#fbbf24' : paceDiff >= 5 ? '#10b981' : paceDiff >= -5 ? '#e2e8f0' : '#ef4444'}` }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>최종 목표: <Mono color="#6366f1">OCC 88%</Mono> · 이 리드타임 중간 목표: <Mono color="#6366f1">{liveTargetOCC}%</Mono> / 현재: <Mono>{liveOCC}%</Mono></div>
                <div style={{ fontSize: 14, fontWeight: 800, color: liveOCC >= 88 ? '#92400e' : paceDiff >= 5 ? '#0ea5e9' : paceDiff >= -5 ? '#10b981' : '#ef4444' }}>
                  {liveOCC >= 88 ? '★ 목표 88% 달성 — 잔여 객실 최고가 유지' : paceDiff >= 5 ? `▲ 페이스 빠름 (+${paceDiff}%p) — 요금 올려 ADR 극대화` : paceDiff >= -5 ? '✓ 정상 페이스 — 88% 목표 궤도 위' : `▼ 페이스 느림 (${paceDiff}%p) — 요금 내려 88% 채우기`}
                </div>
              </div>
            </Card>
            <Card style={{ background: '#0f172a', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              {!hasRevPAR ? (
                <div style={{ textAlign: 'center', color: '#475569' }}><div style={{ fontSize: 32 }}>✏️</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>RevPAR 입력 후 조회 가능</div></div>
              ) : (
                <>
                  <div style={{ fontSize: 10, color: '#475569', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10 }}>CM Push 요금</div>
                  <div style={{ fontSize: 56, fontWeight: 800, color: '#f8fafc', fontFamily: "'DM Mono',monospace", letterSpacing: -2 }}>{fmtW(livePrice)}</div>
                  <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{livePrice?.toLocaleString()}원</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, width: '100%', marginTop: 22 }}>
                    {[{ l: '리드타임', v: LEAD_BANDS.find(l => l.key === liveLead)?.label }, { l: 'OCC 구간', v: OCC_BANDS.find(o => o.key === liveOCCKey)?.label }, { l: '배율', v: `${(matrix[liveLead]?.[liveOCCKey] * 100).toFixed(0)}%` }, { l: '기준 ADR', v: `${(baseADR / 10000).toFixed(1)}만` }, { l: '날짜 유형', v: dateType }, { l: '지점', v: propName.replace(/점$/, '') }].map((s, i) => (
                      <div key={i} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>{s.l}</div>
                        <Mono size={11} color="#94a3b8">{s.v}</Mono>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>
        )}

        {/* ── 페이스 분석 ── */}
        {tab === 'pace' && (() => {
          // 날짜유형 × 월 조합 데이터 계산
          const getFilteredDist = (pName, dtList, mList, roomName) => {
            const src = (roomName && PACE_BY_ROOMTYPE[pName]?.[roomName]) || PACE_DETAIL[pName]
            if (!src) return null
            const bands = ['D-0','D-1~10','D-11~30','D-31~60','D-61~90','D-90+']
            const result = {}
            dtList.forEach(dt => {
              if (!src[dt]) return
              const monthKey = mList.length === 1 ? String(mList[0]) : 'all'
              const raw = mList.length === 0 ? src[dt]['all'] :
                mList.length === 1 ? (src[dt][String(mList[0])] || src[dt]['all']) :
                // 복수 월 선택 시 평균
                (() => {
                  const valid = mList.map(m => src[dt][String(m)]).filter(Boolean)
                  if (!valid.length) return src[dt]['all']
                  const avg = {}
                  bands.forEach(b => { avg[b] = Math.round(valid.reduce((s,d) => s+(d[b]||0),0)/valid.length*10)/10 })
                  return avg
                })()
              result[dt] = raw || {}
            })
            return result
          }
          const activeDTs = [dateTypes || '평일']
          const activePace = getFilteredDist(propName, activeDTs, months ? [months] : [], room?.name)
          const distData = PACE_BANDS.map(band => {
            const row = { band }
            activeDTs.forEach(dt => { row[dt] = activePace?.[dt]?.[band] ?? 0 })
            return row
          })
          const primaryDT = activeDTs[0] || '평일'
          const allPropData = PROP_NAMES.map(p => {
            const pd = PACE_DETAIL[p]?.[primaryDT]?.['all'] || {}
            return { name: p.replace(/점$/, ''), fullName: p,
              단기: (pd['D-0']||0) + (pd['D-1~10']||0),
              중기: (pd['D-11~30']||0),
              장기: (pd['D-31~60']||0) + (pd['D-61~90']||0) + (pd['D-90+']||0),
            }
          }).sort((a, b) => b.단기 - a.단기)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <InsightBar propName={propName} />
              <Card>
                <Head icon="📊" title={`${propName} · ${room?.name} — 리드타임별 예약 점유율`} sub="날짜유형·월 복수 선택 가능 — 예: 7월+8월+주말" />
                {/* 날짜유형 + 월 복수 필터 */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16, alignItems:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#64748b', marginRight:2 }}>날짜유형</span>
                  {DATE_TYPES.map(dt => {
                    const c = DATE_TYPE_COLORS[dt]; const on = dateTypes === dt
                    return <button key={dt} onClick={() => toggleDT(dt)} style={{ padding:'5px 14px', borderRadius:8, cursor:'pointer', fontFamily:'inherit', border:`1.5px solid ${on?c:'#e2e8f0'}`, background:on?`${c}18`:'#fff', color:on?c:'#94a3b8', fontWeight:on?700:500, fontSize:12 }}>{dt}</button>
                  })}
                  <div style={{ width:1, height:20, background:'#e2e8f0', margin:'0 4px' }} />
                  <span style={{ fontSize:11, fontWeight:700, color:'#64748b', marginRight:2 }}>월</span>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                    const on = months === m
                    return <button key={m} onClick={() => toggleMonth(m)} style={{ padding:'5px 8px', borderRadius:8, cursor:'pointer', fontFamily:'inherit', border:`1.5px solid ${on?'#6366f1':'#e2e8f0'}`, background:on?'#eef2ff':'#fff', color:on?'#6366f1':'#94a3b8', fontWeight:on?700:500, fontSize:11, minWidth:34 }}>{m}월</button>
                  })}
                  {(dateTypes !== '평일' || months !== null) && (
                    <button onClick={() => { setDateTypes('평일'); setMonths(null) }} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #fca5a5', background:'#fef2f2', color:'#ef4444', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>초기화</button>
                  )}
                </div>
                <div style={{ display: 'flex', height: 52, borderRadius: 10, overflow: 'hidden', gap: 2, marginBottom: 10 }}>
                  {PACE_BANDS.map((band, i) => { const val = activePace?.[primaryDT]?.[band] ?? 0; if (val < 0.5) return null; return (<div key={band} style={{ width: `${val}%`, background: PACE_COLORS[i], display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1, transition: 'width 0.4s ease' }}>{val >= 6 && <><span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{val}%</span><span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)' }}>{band}</span></>}</div>) })}
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                  {PACE_BANDS.map((band, i) => { const val = activePace?.[primaryDT]?.[band] ?? 0; return (<span key={band} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: PACE_COLORS[i], display: 'inline-block' }} /><span style={{ color: '#374151', fontWeight: 600 }}>{band}</span><span style={{ color: '#94a3b8' }}>{val}%</span></span>) })}
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={distData} barGap={3} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="band" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tickFormatter={v => v + '%'} domain={[0, 60]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip content={<TT />} formatter={v => [`${v}%`]} /><Legend />
                    {DATE_TYPES.map(dt => <Bar key={dt} dataKey={dt} fill={DATE_TYPE_COLORS[dt]} radius={[4, 4, 0, 0]} opacity={activeDTs.includes(dt) ? 1 : 0.35} />)}
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card>
                <Head icon="🔍" title={`전 지점 단기·중기·장기 비중 비교 (${primaryDT}${months?` · ${months}월`:''})`} sub="단기=D-0~7 / 중기=D-8~30 / 장기=D-31+" />
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={allPropData} layout="vertical" barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => v + '%'} domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip content={<TT />} formatter={v => [`${v.toFixed(1)}%`]} /><Legend />
                    <Bar dataKey="단기" stackId="s" fill="#ef4444">{allPropData.map((d, i) => <Cell key={i} fill={d.fullName === propName ? '#ef4444' : '#ef444455'} />)}</Bar>
                    <Bar dataKey="중기" stackId="s" fill="#0ea5e9">{allPropData.map((d, i) => <Cell key={i} fill={d.fullName === propName ? '#0ea5e9' : '#0ea5e955'} />)}</Bar>
                    <Bar dataKey="장기" stackId="s" fill="#6366f1" radius={[0, 4, 4, 0]}>{allPropData.map((d, i) => <Cell key={i} fill={d.fullName === propName ? '#6366f1' : '#6366f155'} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )
        })()}

        {/* 하단 */}
        <div style={{ marginTop: 20, background: '#0f172a', borderRadius: 12, padding: '18px 24px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[
            { t: '데이터 기반 설계', ls: ['3년 104만건 실거래 데이터 분석', '지점별 날짜유형 ADR 배율 자동 반영', '리드타임별 목표 OCC = 실제 예약 누적 패턴'] },
            { t: '요금 산출 공식', ls: ['요금 = 기준ADR × 배율 (최저~최고가 클램핑)', '기준ADR = 목표RevPAR ÷ 0.75 × 날짜유형배율', 'OCC↑ = 배율↑ / 리드타임가깝고 OCC↓ = 배율↓'] },
            { t: '88% OCC 전략', ls: ['목표는 88% 달성 + ADR 극대화', '빠름 → 올려서 ADR 높이기', '느림 → 내려서 88% 채우기', '88%+ → 최고가 유지 (보너스 판매)'] },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#7dd3fc', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{s.t}</div>
              {s.ls.map((l, j) => <div key={j} style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontFamily: "'DM Mono',monospace" }}>· {l}</div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
