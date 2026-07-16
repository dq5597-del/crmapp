'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'

// VAPID 公鑰（公開資訊）
const VAPID_PUBLIC = 'BP8BPVI8pIT3sqDQp2rq4Y76NW3vQG4y3DaI9I72xVn-kcrsXc66UV7frGxC0lnWJCTPdoq-NLs8aBKOq84imzI'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export default function PushInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    const supabase = createClient()
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        if (Notification.permission === 'denied') return
        let perm = Notification.permission
        if (perm === 'default') perm = await Notification.requestPermission()
        if (perm !== 'granted') return
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
          })
        }
        const { data: sess } = await supabase.auth.getSession()
        if (!sess.session) return
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session.access_token}` },
          body: JSON.stringify({ subscription: sub }),
        })
      } catch (e) {
        // 靜默：不支援或使用者未授權時不影響其他功能
      }
    })()
  }, [])
  return null
}
