// app/api/wallet/tasks/today/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  const today = new Date().toISOString().split('T')[0]

  const { data: tasks } = await supabase
    .from('wallet_tasks')
    .select('id, title, description, priority, status, due_date, contact_id, contacts(name, phone)')
    .eq('organization_id', profile.organization_id)
    .eq('assigned_to', profile.id)
    .eq('due_date', today)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const sorted = (tasks || []).sort((a, b) =>
    (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
  )

  return NextResponse.json({
    tasks: sorted,
    pending: sorted.filter(t => t.status === 'pending').length,
    done: sorted.filter(t => t.status === 'done').length,
  })
}
