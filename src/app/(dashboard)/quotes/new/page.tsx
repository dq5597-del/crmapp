'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import QuoteForm from '@/components/quotes/QuoteForm'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

function QuoteNewInner() {
  const sp = useSearchParams()
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/quotes" className="text-gray-500 hover:text-gray-900"><ArrowLeft size={20} /></Link>
        <h1 className="text-xl font-bold text-gray-900">新增報價單</h1>
      </div>
      <QuoteForm
        prefillClientId={sp.get('client_id') ?? undefined}
        prefillClientName={sp.get('client_name') ?? undefined}
        prefillPhone={sp.get('phone') ?? undefined}
        prefillContact={sp.get('contact') ?? undefined}
        prefillProjectId={sp.get('project_id') ?? undefined}
        prefillProjectName={sp.get('project_name') ?? undefined}
      />
    </div>
  )
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">載入中...</div>}>
      <QuoteNewInner />
    </Suspense>
  )
}
