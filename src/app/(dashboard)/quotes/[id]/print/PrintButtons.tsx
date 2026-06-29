'use client'

export default function PrintButtons() {
  return (
    <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 50 }}>
      <button
        onClick={() => window.print()}
        style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        列印 / 存成 PDF
      </button>
      <button
        onClick={() => window.close()}
        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
      >
        關閉
      </button>
    </div>
  )
}
