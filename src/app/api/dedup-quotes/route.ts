import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createClient()

  // 1. Get all quotes with their quote_no and id
  const { data: allQuotes, error } = await supabase
    .from('quotes')
    .select('id, quote_no, total_amount, created_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 2. Group by base quote_no (strip -N suffix)
  const groups: Record<string, typeof allQuotes> = {}
  for (const q of allQuotes ?? []) {
    const base = q.quote_no.replace(/-\d+$/, '')
    if (!groups[base]) groups[base] = []
    groups[base]!.push(q)
  }

  // 3. For each group, pick the winner: prefer original (no suffix), then whichever has items
  const toDelete: string[] = []
  const winners: { quote_no: string; id: string; kept: string }[] = []

  for (const [base, variants] of Object.entries(groups)) {
    if (variants.length === 1) continue // no duplicates

    // Check which variants have items
    const itemCounts = await Promise.all(
      variants.map(async (v) => {
        const { count } = await supabase
          .from('quote_items')
          .select('id', { count: 'exact', head: true })
          .eq('quote_id', v.id)
        return { ...v, itemCount: count ?? 0 }
      })
    )

    // Pick winner: first with items, or first overall
    const winner = itemCounts.find(v => v.itemCount > 0) ?? itemCounts[0]!

    // Queue rest for deletion
    for (const v of itemCounts) {
      if (v.id !== winner.id) toDelete.push(v.id)
    }

    // If winner has a suffix, rename it to base
    if (winner.quote_no !== base) {
      await supabase.from('quotes').update({ quote_no: base }).eq('id', winner.id)
      winners.push({ quote_no: base, id: winner.id, kept: winner.quote_no })
    } else {
      winners.push({ quote_no: base, id: winner.id, kept: winner.quote_no })
    }
  }

  // 4. Delete losers (items first, then quotes)
  let deletedItems = 0
  let deletedQuotes = 0

  if (toDelete.length > 0) {
    // Delete in batches of 50
    for (let i = 0; i < toDelete.length; i += 50) {
      const batch = toDelete.slice(i, i + 50)
      const { count: ic } = await supabase
        .from('quote_items')
        .delete({ count: 'exact' })
        .in('quote_id', batch)
      deletedItems += ic ?? 0

      const { count: qc } = await supabase
        .from('quotes')
        .delete({ count: 'exact' })
        .in('id', batch)
      deletedQuotes += qc ?? 0
    }
  }

  return NextResponse.json({
    ok: true,
    totalGroups: Object.keys(groups).length,
    duplicateGroups: Object.values(groups).filter(v => v.length > 1).length,
    deletedQuotes,
    deletedItems,
    winners: winners.slice(0, 10),
  })
}
