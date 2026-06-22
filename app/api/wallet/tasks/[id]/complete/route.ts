// app/api/wallet/tasks/[id]/complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({
      error: 'Unauthorized',
      debug: { authError: authError?.message || null }
    }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({
      error: 'Perfil não encontrado',
      debug: { userId: user.id, profileError: profileError?.message || null }
    }, { status: 404 })
  }

  // Buscar a tarefa
  const { data: task, error: taskError } = await supabase
    .from('wallet_tasks')
    .select('id, contact_id, assigned_to, status, organization_id')
    .eq('id', params.id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  if (!task) {
    return NextResponse.json({
      error: 'Tarefa não encontrada',
      debug: {
        paramsId: params.id,
        userId: user.id,
        profileOrgId: profile.organization_id,
        taskError: taskError?.message || null,
      }
    }, { status: 404 })
  }

  if (task.status === 'done') {
    return NextResponse.json({ success: true, message: 'Tarefa já estava concluída' })
  }

  // Marcar como concluída
  const { error: updateError } = await supabase
    .from('wallet_tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', task.id)

  if (updateError) {
    return NextResponse.json({
      error: 'Falha ao atualizar tarefa',
      debug: { updateError: updateError.message }
    }, { status: 500 })
  }

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
