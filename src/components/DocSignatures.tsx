'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import SignaturePad from './SignaturePad'

export type SignRole = 'customer' | 'engineer' | 'sales'
export type DocType = 'survey' | 'acceptance' | 'diagram' | 'quote'

const ROLES: { key: SignRole; label: string }[] = [
  { key: 'customer', label: '單位簽認' },
  { key: 'engineer', label: '工程師' },
  { key: 'sales',    label: '業務' },
]

type Sig = {
  id: string; role: SignRole; signer_name: string
  signature_data: string; signed_at: string
}

/**
 * 三方簽名區（客戶／工程師／業務）
 * - 已簽：顯示簽名圖＋姓名＋日期（列印會帶出）
 * - 未簽：螢幕上顯示「點此簽名」按鈕（不列印），列印時保留空白簽名格供手寫
 */
export default function DocSignatures({ docType, refId }: { docType: DocType; refId: string }) {
  const supabase = createClient()
  const [sigs, setSigs] = useState<Record<string, Sig>>({})
  const [signingRole, setSigningRole] = useState<SignRole | null>(null)

  useEffect(() => { fetchSigs() }, [refId])

  async function fetchSigs() {
    const { data } = await supabase
      .from('document_signatures').select('*')
      .eq('doc_type', docType).eq('ref_id', refId)
    const map: Record<string, Sig> = {}
    ;(data ?? []).forEach((s: any) => { map[s.role] = s })
    setSigs(map)
  }

  async function saveSig(role: SignRole, dataUrl: string, signerName: string) {
    const { error } = await supabase.from('document_signatures').upsert({
      doc_type: docType, ref_id: refId, role,
      signer_name: signerName, signature_data: dataUrl,
      signed_at: new Date().toISOString(),
    }, { onConflict: 'doc_type,ref_id,role' })
    if (error) throw error
    await fetchSigs()
  }

  async function removeSig(role: SignRole) {
    if (!confirm('確認清除此簽名？')) return
    await supabase.from('document_signatures').delete()
      .eq('doc_type', docType).eq('ref_id', refId).eq('role', role)
    await fetchSigs()
  }

  return (
    <div style={{ marginTop: 24, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', gap: 16 }}>
        {ROLES.map(r => {
          const sig = sigs[r.key]
          return (
            <div key={r.key} style={{ flex: 1, border: '1px solid #888', borderRadius: 4 }}>
              <div style={{ background: '#f1f5f9', borderBottom: '1px solid #888', padding: '4px 8px', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                {r.label}
              </div>
              <div style={{ height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: 4 }}>
                {sig ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sig.signature_data} alt={r.label} style={{ maxHeight: 80, maxWidth: '100%' }} />
                    <button onClick={() => removeSig(r.key)} className="no-print"
                      title="清除簽名"
                      style={{ position: 'absolute', top: 2, right: 2, border: 'none', background: '#fee2e2', color: '#dc2626', borderRadius: 4, fontSize: 10, cursor: 'pointer', padding: '2px 6px' }}>
                      清除
                    </button>
                  </>
                ) : (
                  <button onClick={() => setSigningRole(r.key)} className="no-print"
                    style={{ padding: '8px 18px', background: '#eff6ff', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    ✍ 點此簽名
                  </button>
                )}
              </div>
              <div style={{ borderTop: '1px solid #ccc', padding: '3px 8px', fontSize: 11, color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                <span>{sig?.signer_name ? `簽名人：${sig.signer_name}` : '簽名人：＿＿＿＿＿'}</span>
                <span>{sig ? new Date(sig.signed_at).toLocaleDateString('zh-TW') : '日期：＿＿＿＿＿'}</span>
              </div>
            </div>
          )
        })}
      </div>

      {signingRole && (
        <SignaturePad
          title={`${ROLES.find(r => r.key === signingRole)!.label}／簽名`}
          onSave={(dataUrl, name) => saveSig(signingRole, dataUrl, name)}
          onClose={() => setSigningRole(null)}
        />
      )}
    </div>
  )
}
