// app/api/deals/[id]/won/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params
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

  // ── Automação de Carteira: atualizar last_purchase_date e mover para "Recomprou" ──
  try {
    const contactId = updated.contact_id
    const today = new Date().toISOString().split('T')[0]

    if (contactId) {
      // Atualizar last_purchase_date do contato
      await supabase
        .from('contacts')
        .update({
          last_purchase_date: today,
          wallet_stage: 'active',
        })
        .eq('id', contactId)
        .eq('organization_id', profile!.organization_id)

      // Buscar o dono do contato (owner_id) para achar o board da carteira
      const { data: contact } = await supabase
        .from('contacts')
        .select('owner_id')
        .eq('id', contactId)
        .maybeSingle()

      if (contact?.owner_id) {
        // Buscar nome do vendedor
        const { data: seller } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', contact.owner_id)
          .maybeSingle()

        if (seller?.name) {
          const carteiraBoardName = `Carteira ${seller.name}`

          // Buscar board da carteira
          const { data: carteiraBoard } = await supabase
            .from('boards')
            .select('id')
            .eq('organization_id', profile!.organization_id)
            .eq('name', carteiraBoardName)
            .maybeSingle()

          if (carteiraBoard) {
            // Buscar estágio "Recomprou"
            const { data: recomprouStage } = await supabase
              .from('board_stages')
              .select('id')
              .eq('board_id', carteiraBoard.id)
              .eq('name', 'Recomprou')
              .maybeSingle()

            if (recomprouStage) {
              // Mover card da carteira para "Recomprou"
              await supabase
                .from('deals')
                .update({ stage_id: recomprouStage.id })
                .eq('organization_id', profile!.organization_id)
                .eq('board_id', carteiraBoard.id)
                .eq('contact_id', contactId)
            }
          }
        }
      }
    }
  } catch (e) {
    // Não bloquear o retorno em caso de erro na automação da carteira
    console.error('[won] Erro na automação de carteira:', e)
  }

  return NextResponse.json({ success: true, deal: updated })
}
