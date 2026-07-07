// 機櫃圖靜態渲染（列印/PDF 用，Server Component 可用）
import { EQUIP_TYPES } from '@/lib/project-doc-spec'
import type { Rack, RackItem } from './RackDesigner'

const ROW_H = 16 // 列印用每 U 高度 px

function typeColor(t: string) {
  return EQUIP_TYPES.find(e => e.key === t)?.color ?? '#64748b'
}

export default function RackPrint({ racks, items }: { racks: Rack[]; items: RackItem[] }) {
  if (racks.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {racks.map(rack => {
        const its = items.filter(i => i.rack_id === rack.id)
        return (
          <div key={rack.id}>
            <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', marginBottom: 4, color: '#334155' }}>
              {rack.rack_name}（{rack.total_u}U）
            </div>
            <div style={{ display: 'flex' }}>
              <div style={{ display: 'flex', flexDirection: 'column-reverse', marginRight: 3 }}>
                {Array.from({ length: rack.total_u }, (_, i) => i + 1).map(u => (
                  <div key={u} style={{ height: ROW_H, width: 18, fontSize: 7, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 2 }}>{u}</div>
                ))}
              </div>
              <div style={{ position: 'relative', width: 150, height: rack.total_u * ROW_H, border: '2px solid #475569', borderRadius: 3, background: '#f8fafc' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column-reverse' }}>
                  {Array.from({ length: rack.total_u }, (_, i) => i + 1).map(u => (
                    <div key={u} style={{ height: ROW_H, borderTop: '1px dashed #e2e8f0' }} />
                  ))}
                </div>
                {its.map(it => {
                  const col = typeColor(it.equipment_type)
                  return (
                    <div key={it.id} style={{
                      position: 'absolute', left: 2, right: 2,
                      bottom: (it.start_u - 1) * ROW_H + 1,
                      height: it.u_size * ROW_H - 2,
                      background: col + '26', border: `1.5px solid ${col}`, borderRadius: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      <span style={{ fontSize: 8, fontWeight: 600, color: col, lineHeight: 1.1, textAlign: 'center', padding: '0 2px' }}>
                        {it.label}（{it.u_size}U）
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
