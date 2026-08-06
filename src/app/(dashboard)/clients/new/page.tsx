'use client'

import { useRouter } from 'next/navigation'
import ClientForm from '@/components/clients/ClientForm'

export default function NewClientPage() {
  const router = useRouter()

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">新增客戶</h1>
      <ClientForm onSuccess={(id) => router.push(`/clients/${id}`)} />
    </div>
  )
}
