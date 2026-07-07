// 靜態版現場設備標示圖（供列印/PDF 使用，無互動；Server Component 可直接渲染）
import { EQUIP_TYPES, EquipMarker, isMarkerUnlabeled } from '@/lib/project-doc-spec'

export default function EquipmentMapPrint({ markers, roomL, roomW }: {
  markers: EquipMarker[]
  roomL: number
  roomW: number
}) {
  const L = roomL > 0 ? roomL : 10
  const W = roomW > 0 ? roomW : 8
  const pad = Math.max(L, W) * 0.06
  const r = Math.max(L, W) * 0.018        // 圓點半徑（與編輯畫面比例一致）
  const lineW = Math.max(L, W) * 0.004
  const colorOf = (t: string) => EQUIP_TYPES.find(e => e.key === t)?.color ?? '#64748b'

  const gridLines: JSX.Element[] = []
  for (let x = 1; x < L; x++) gridLines.push(<line key={`vx${x}`} x1={x} y1={0} x2={x} y2={W} stroke="#e2e8f0" strokeWidth={lineW / 2} />)
  for (let y = 1; y < W; y++) gridLines.push(<line key={`hy${y}`} x1={0} y1={y} x2={L} y2={y} stroke="#e2e8f0" strokeWidth={lineW / 2} />)

  return (
    <svg
      viewBox={`${-pad} ${-pad * 1.6} ${L + pad * 2} ${W + pad * 2.6}`}
      style={{ width: '100%', height: 'auto', display: 'block', background: '#fff' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {EQUIP_TYPES.map(t => (
          <marker key={t.key} id={`parr-${t.key}`} viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={t.color} />
          </marker>
        ))}
      </defs>

      {/* 房間外框與格線 */}
      <rect x={0} y={0} width={L} height={W} fill="#f8fafc" stroke="#475569" strokeWidth={lineW * 2} />
      {gridLines}
      {/* 尺寸標註 */}
      <text x={L / 2} y={-pad * 0.5} textAnchor="middle" fontSize={r * 1.2} fill="#64748b" fontFamily="sans-serif">{L}m</text>
      <text x={-pad * 0.5} y={W / 2} textAnchor="middle" fontSize={r * 1.2} fill="#64748b" fontFamily="sans-serif"
        transform={`rotate(-90, ${-pad * 0.5}, ${W / 2})`}>{W}m</text>

      {markers.map(mk => {
        const col = colorOf(mk.equipment_type)
        const unlabeled = isMarkerUnlabeled(mk)
        const shType = mk.shape_type ?? 'circle'
        const labelText = unlabeled ? '⚠ 未標示' : mk.label
        const labelFill = unlabeled ? '#dc2626' : '#1e293b'

        if (shType === 'rect') {
          const rx = (mk.x_pct / 100) * L
          const ry = (mk.y_pct / 100) * W
          const rw = ((mk.w_pct ?? 10) / 100) * L
          const rh = ((mk.h_pct ?? 10) / 100) * W
          return (
            <g key={mk.id}>
              <rect x={rx} y={ry} width={rw} height={rh}
                fill={col} fillOpacity={0.18} stroke={col} strokeWidth={lineW * 1.5} rx={lineW} />
              <text x={rx + rw / 2} y={ry + rh / 2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={Math.min(r * 0.85, rw * 0.15, rh * 0.35)}
                fill={unlabeled ? '#dc2626' : col} fontWeight="600" fontFamily="sans-serif">
                {labelText}
              </text>
            </g>
          )
        }

        if (shType === 'line' || shType === 'arrow') {
          const x1 = (mk.x_pct / 100) * L
          const y1 = (mk.y_pct / 100) * W
          const x2 = ((mk.x2_pct ?? mk.x_pct + 10) / 100) * L
          const y2 = ((mk.y2_pct ?? mk.y_pct) / 100) * W
          const lmx = (x1 + x2) / 2
          const lmy = (y1 + y2) / 2
          const isVert = Math.abs(y2 - y1) > Math.abs(x2 - x1)
          const offAmt = r * 1.5
          const textX = lmx + (isVert ? offAmt : 0)
          const textY = lmy + (isVert ? 0 : -offAmt)
          return (
            <g key={mk.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={col} strokeWidth={lineW * 2}
                markerEnd={shType === 'arrow' ? `url(#parr-${mk.equipment_type})` : undefined} />
              <text x={textX} y={textY}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={r * 0.75} fill={unlabeled ? '#dc2626' : col} fontWeight="600" fontFamily="sans-serif"
                transform={isVert ? `rotate(-90, ${textX}, ${textY})` : undefined}>
                {labelText}
              </text>
            </g>
          )
        }

        // circle
        const mx = (mk.x_pct / 100) * L
        const my = (mk.y_pct / 100) * W
        return (
          <g key={mk.id}>
            <text x={mx} y={my - r - lineW}
              textAnchor="middle" fontSize={r * 0.85} fill={labelFill}
              fontWeight="600" fontFamily="sans-serif">
              {labelText}
            </text>
            <circle cx={mx} cy={my} r={r} fill={col} stroke="white" strokeWidth={r * 0.12} opacity={0.92} />
          </g>
        )
      })}
    </svg>
  )
}

/** 圖例（列印用） */
export function EquipmentLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 11, color: '#334155', marginTop: 8 }}>
      {EQUIP_TYPES.map(t => (
        <span key={t.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
          {t.label}
        </span>
      ))}
    </div>
  )
}
