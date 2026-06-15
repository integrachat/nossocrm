// app/api/wallet/tasks/[id]/complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  // Buscar a tarefa
  const { data: task } = await supabase
    .from('wallet_tasks')
    .select('id, contact_id, assigned_to, status')
    .eq('id', params.id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  if (!task) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
  if (task.status === 'done') {
    return NextResponse.json({ success: true, message: 'Tarefa já estava concluída' })
  }

  // Marcar como concluída
  await supabase
    .from('wallet_tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', task.id)

  // Mover o card do contato no board "Carteira [Vendedor]" para "Contatado"
  const boardName = `Carteira ${profile.name}`

  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .eq('name', boardName)
    .maybeSingle()

  if (board) {
    const { data: contatadoStage } = await supabase
      .from('board_stages')
      .select('id')
      .eq('board_id', board.id)
      .eq('name', 'Contatado')
      .maybeSingle()

    if (contatadoStage) {
      await supabase
        .from('deals')
        .update({ stage_id: contatadoStage.id })
        .eq('organization_id', profile.organization_id)
        .eq('board_id', board.id)
        .eq('contact_id', task.contact_id)
    }
  }

  return NextResponse.json({ success: true, message: 'Tarefa concluída e card movido para Contatado' })
}
