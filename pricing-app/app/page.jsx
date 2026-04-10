'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts'

const BAND_ORDER = ['D-0', 'D-1~3', 'D-4~7', 'D-8~14', 'D-15~30', 'D-31~60', 'D-61~90', 'D-90+']
const BAND_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280']
const BAND_LABELS = {
  'D-0': '당일', 'D-1~3': '1~3일', 'D-4~7': '4~7일', 'D-8~14': '1~2주',
  'D-15~30': '2~4주', 'D-31~60': '1~2개월', 'D-61~90': '2~3개월', 'D-90+': '3개월+',
}

export default function Page() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [sortBy, setSortBy] = useState('median') // median | name | urgent

  useEffect(() => {
    fetch('/api/leadtime')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch(e => setError(e.message))
  }, [])

  // 지점별 분포 데이터 가공
  const branches = useMemo(() => {
    if (!data) return []
    const map = {}
    for (const row of data.distribution) {
      if (!map[row.b_name]) map[row.b_name] = { name: row.b_name, branchId: row.branchId, bands: {} }
      map[row.b_name].bands[row.band] = { cnt: row.cnt, avg_lt: row.avg_lt }
    }
    // summary 병합
    for (const row of data.summary) {
      if (map[row.b_name]) {
        map[row.b_name].total = row.total
        map[row.b_name].avg_lt = row.avg_lt
        map[row.b_name].median_lt = row.median_lt
        map[row.b_name].within_7d_pct = row.within_7d_pct
      }
    }

    let arr = Object.values(map).filter(b => b.total > 0)
    if (sortBy === 'median') arr.sort((a, b) => a.median_lt - b.median_lt)
    else if (sortBy === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortBy === 'urgent') arr.sort((a, b) => b.within_7d_pct - a.within_7d_pct)
    return arr
  }, [data, sortBy])

  const selectedBranch = useMemo(() => {
    if (!selected) return null
    return branches.find(b => b.name === selected)
  }, [branches, selected])

  // 선택 지점 차트 데이터
  const chartData = useMemo(() => {
    if (!selectedBranch) return []
    const total = selectedBranch.total || 1
    return BAND_ORDER.map(band => {
      const d = selectedBranch.bands[band]
      return {
        band,
        label: BAND_LABELS[band],
        cnt: d?.cnt || 0,
        pct: Math.round(((d?.cnt || 0) / total) * 1000) / 10,
      }
    })
  }, [selectedBranch])

  // 전지점 비교 차트 (7일 이내 비율)
  const compareData = useMemo(() => {
    return branches.map(b => ({
      name: b.name.replace('핸디즈 ', '').replace('부티크 ', ''),
      median_lt: b.median_lt,
      within_7d_pct: b.within_7d_pct,
      isSelected: b.name === selected,
    }))
  }, [branches, selected])

  if (error) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 max-w-md">
        <p className="text-red-400 font-medium">데이터 로딩 실패</p>
        <p className="text-red-300 text-sm mt-2">{error}</p>
      </div>
    </div>
  )

  if (!data) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-slate-400 animate-pulse text-lg">데이터 로딩 중...</div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">지점별 리드타임 분포</h1>
        <p className="text-slate-400 text-sm mt-1">최근 180일 체크인 기준 · duck 실시간 데이터</p>
      </div>

      {/* 전지점 비교 바 차트 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">전지점 중앙 리드타임 비교</h2>
          <div className="flex gap-2">
            {[
              { key: 'median', label: '중앙값순' },
              { key: 'urgent', label: '단기비율순' },
              { key: 'name', label: '이름순' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`px-3 py-1 text-xs rounded-full transition ${
                  sortBy === s.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: Math.max(400, branches.length * 28) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compareData} layout="vertical" margin={{ left: 100, right: 30 }}
              onClick={(e) => e?.activeLabel && setSelected(branches.find(b =>
                b.name.replace('핸디즈 ', '').replace('부티크 ', '') === e.activeLabel
              )?.name)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" domain={[0, 'auto']} tick={{ fill: '#94a3b8', fontSize: 12 }}
                label={{ value: '중앙 리드타임 (일)', position: 'bottom', fill: '#94a3b8', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={95}
                tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(v, name) => [
                  name === 'median_lt' ? `${v}일` : `${v}%`,
                  name === 'median_lt' ? '중앙 리드타임' : '7일내 예약 비율'
                ]}
              />
              <Bar dataKey="median_lt" radius={[0, 4, 4, 0]} cursor="pointer">
                {compareData.map((d, i) => (
                  <Cell key={i} fill={d.isSelected ? '#3b82f6' : d.median_lt <= 5 ? '#ef4444' : d.median_lt <= 10 ? '#f97316' : d.median_lt <= 20 ? '#22c55e' : '#8b5cf6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-500 mt-2">클릭하면 해당 지점 상세 분포를 볼 수 있습니다</p>
      </div>

      {/* 지점 상세 분포 */}
      {selectedBranch && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedBranch.name}</h2>
              <p className="text-slate-400 text-sm">
                총 {selectedBranch.total?.toLocaleString()}건 ·
                평균 {selectedBranch.avg_lt}일 ·
                중앙값 {selectedBranch.median_lt}일 ·
                7일내 {selectedBranch.within_7d_pct}%
              </p>
            </div>
            <button onClick={() => setSelected(null)}
              className="text-slate-500 hover:text-slate-300 text-xl px-2">✕</button>
          </div>

          {/* KPI 카드 */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: '평균 리드타임', value: `${selectedBranch.avg_lt}일`, color: 'text-blue-400' },
              { label: '중앙 리드타임', value: `${selectedBranch.median_lt}일`, color: 'text-green-400' },
              { label: '7일내 예약', value: `${selectedBranch.within_7d_pct}%`, color: selectedBranch.within_7d_pct > 70 ? 'text-red-400' : 'text-yellow-400' },
              { label: '총 예약건', value: selectedBranch.total?.toLocaleString(), color: 'text-slate-300' },
            ].map((kpi, i) => (
              <div key={i} className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">{kpi.label}</div>
                <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* 막대 차트 */}
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }}
                  label={{ value: '비율 (%)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                  formatter={(v, name) => [
                    name === 'pct' ? `${v}%` : `${v.toLocaleString()}건`,
                    name === 'pct' ? '비율' : '건수'
                  ]}
                />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={BAND_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 테이블 */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">리드타임</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">건수</th>
                  <th className="text-right py-2 px-3 text-slate-400 font-medium">비율</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium w-1/2">분포</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => (
                  <tr key={row.band} className="border-b border-slate-800/50">
                    <td className="py-2 px-3 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: BAND_COLORS[i] }} />
                      <span className="text-slate-300">{row.band}</span>
                      <span className="text-slate-500 text-xs">({row.label})</span>
                    </td>
                    <td className="text-right py-2 px-3 text-slate-300 tabular-nums">{row.cnt.toLocaleString()}</td>
                    <td className="text-right py-2 px-3 text-white font-medium tabular-nums">{row.pct}%</td>
                    <td className="py-2 px-3">
                      <div className="bg-slate-800 rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(row.pct, 100)}%`, background: BAND_COLORS[i] }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 전지점 요약 테이블 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-lg font-semibold text-white mb-4">전지점 요약</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-3 text-slate-400 font-medium">지점</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">총 건수</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">평균(일)</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">중앙값(일)</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">7일내(%)</th>
                <th className="text-left py-2 px-3 text-slate-400 font-medium w-40">분포</th>
              </tr>
            </thead>
            <tbody>
              {branches.map(b => {
                const total = b.total || 1
                const bandPcts = BAND_ORDER.map(band => ((b.bands[band]?.cnt || 0) / total) * 100)
                return (
                  <tr key={b.name}
                    className={`border-b border-slate-800/50 cursor-pointer transition hover:bg-slate-800/30 ${
                      selected === b.name ? 'bg-blue-900/20' : ''
                    }`}
                    onClick={() => setSelected(b.name)}
                  >
                    <td className="py-2 px-3 text-slate-200 font-medium">{b.name}</td>
                    <td className="text-right py-2 px-3 text-slate-300 tabular-nums">{b.total?.toLocaleString()}</td>
                    <td className="text-right py-2 px-3 text-slate-300 tabular-nums">{b.avg_lt}</td>
                    <td className="text-right py-2 px-3 text-white font-semibold tabular-nums">{b.median_lt}</td>
                    <td className={`text-right py-2 px-3 font-semibold tabular-nums ${
                      b.within_7d_pct > 70 ? 'text-red-400' : b.within_7d_pct > 50 ? 'text-yellow-400' : 'text-green-400'
                    }`}>{b.within_7d_pct}%</td>
                    <td className="py-2 px-3">
                      <div className="flex h-4 rounded-full overflow-hidden bg-slate-800">
                        {bandPcts.map((pct, i) => pct > 0 ? (
                          <div key={i} style={{ width: `${pct}%`, background: BAND_COLORS[i] }}
                            title={`${BAND_ORDER[i]}: ${Math.round(pct)}%`} />
                        ) : null)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
