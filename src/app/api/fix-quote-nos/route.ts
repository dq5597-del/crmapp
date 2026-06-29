import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'

// Strips -N suffix to get base quote_no
function base(quoteNo: string) {
  return quoteNo.replace(/-\d+$/, '')
}

export async function GET() {
  const supabase = createClient()

  const { data: allQuotes } = await supabase
    .from('quotes')
    .select('id, quote_no')
    .order('quote_no')

  if (!allQuotes) return NextResponse.json({ error: 'fetch failed' }, { status: 500 })

  // Find which base names are already taken by a clean (no suffix) quote
  const cleanNames = new Set(
    allQuotes.filter(q => !/-\d+$/.test(q.quote_no)).map(q => q.quote_no)
  )

  const renamed: string[] = []
  const skipped: string[] = []

  for (const q of allQuotes) {
    if (!/-\d+$/.test(q.quote_no)) continue // already clean

    const b = base(q.quote_no)

    if (cleanNames.has(b)) {
      // Clean version already exists — this shouldn't happen after dedup, skip
      skipped.push(q.quote_no)
      continue
    }

    // Safe to rename
    const { error } = await supabase
      .from('quotes')
      .update({ quote_no: b })
      .eq('id', q.id)

    if (error) {
      skipped.push(`${q.quote_no} → ${error.message}`)
    } else {
      cleanNames.add(b)
      renamed.push(`${q.quote_no} → ${b}`)
    }
  }

  return NextResponse.json({ ok: true, renamed, skipped })
}
