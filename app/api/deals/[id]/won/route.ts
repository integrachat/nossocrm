// app/api/deals/[id]/won/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { revenueAmount } = await req.json()

  if (!revenueAmount || isNaN(Number(revenueAmount)) || Number(revenueAmount) <= 0) {
    return NextResponse.json({ error: 'Informe um valor de receita válido (R$)' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const { data: deal } = await supabase
    .from('deals')
    .select('id, board_id, won_stage_id')
    .eq('id', params.id)
    .eq('organization_id', profile?.organization_id)
    .maybeSingle()

  if (!deal) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 })

  // Usar won_stage_id do board se existir, senão buscar estágio "Ganho"
  let wonStageId = deal.won_stage_id

  if (!wonStageId) {
    const { data: wonStage } = await supabase
      .from('board_stages')
      .select('id')
      .eq('board_id', deal.board_id)
      .ilike('name', 'Ganho')
      .maybeSingle()
    wonStageId = wonStage?.id || null
  }

  const updateData: Record<string, any> = {
    revenue_amount: Number(revenueAmount),
    closed_at: new Date().toISOString(),
    is_won: true,
    is_lost: false,
    status: 'won',
  }

  if (wonStageId) updateData.stage_id = wonStageId

  const { data: updated, error } = await supabase
    .from('deals')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, deal: updated })
}
