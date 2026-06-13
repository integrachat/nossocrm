// app/api/whatsapp/accept/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await req.json()
  if (!conversationId) return NextResponse.json({ error: 'conversationId obrigatório' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  const { data: conv } = await supabase
    .from('whatsapp_conversations')
    .select('id, deal_id, status')
    .eq('id', conversationId)
    .eq('organization_id', profile.organization_id)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  if (conv.status === 'active') return NextResponse.json({ error: 'Conversa já em atendimento' }, { status: 409 })

  // Atribuir conversa ao vendedor
  await supabase
    .from('whatsapp_conversations')
    .update({ assigned_to: profile.id, assigned_at: new Date().toISOString(), status: 'active' })
    .eq('id', conversationId)

  // Buscar ou criar board do vendedor "Vendas [Nome]"
  const boardName = `Vendas ${profile.name}`

  let { data: sellerBoard } = await supabase
    .from('boards')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .eq('name', boardName)
    .maybeSingle()

  if (!sellerBoard) {
    const { data: newBoard } = await supabase
      .from('boards')
      .insert({ organization_id: profile.organization_id, name: boardName, owner_id: profile.id })
      .select('id')
      .single()

    sellerBoard = newBoard

    // Criar estágios padrão
    await supabase.from('board_stages').insert([
      { board_id: newBoard!.id, organization_id: profile.organization_id, name: 'Em atendimento', order: 1 },
      { board_id: newBoard!.id, organization_id: profile.organization_id, name: 'Proposta enviada', order: 2 },
      { board_id: newBoard!.id, organization_id: profile.organization_id, name: 'Negociação', order: 3 },
      { board_id: newBoard!.id, organization_id: profile.organization_id, name: 'Ganho', order: 4 },
      { board_id: newBoard!.id, organization_id: profile.organization_id, name: 'Perdido', order: 5 },
    ])
  }

  // Buscar primeiro estágio do board do vendedor
  const { data: firstStage } = await supabase
    .from('board_stages')
    .select('id')
    .eq('board_id', sellerBoard!.id)
    .order('order', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Mover deal para o pipeline do vendedor
  if (conv.deal_id && firstStage) {
    await supabase
      .from('deals')
      .update({ board_id: sellerBoard!.id, stage_id: firstStage.id, owner_id: profile.id })
      .eq('id', conv.deal_id)
  }

  return NextResponse.json({ success: true, boardName, message: `Atribuído a ${profile.name}` })
}
