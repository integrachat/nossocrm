// app/api/contacts/import-wallet/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const RECOMPROU_DAYS_THRESHOLD = 6

interface SellerBoardCache {
  boardId: string
  stages: {
    paraContatarHoje: string
    contatado: string
    semResposta: string
    recomprou: string
  }
  ownerId: string | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem fazer upload' }, { status: 403 })
  }

  const orgId = profile.organization_id
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const text = await file.text()
  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim())
  if (lines.length < 2) return NextResponse.json({ error: 'CSV vazio' }, { status: 400 })

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const col = (name: string) => headers.indexOf(name)

  const nameIdx         = col('nome') !== -1 ? col('nome') : col('name')
  const phoneIdx        = col('telefone') !== -1 ? col('telefone') : col('phone')
  const emailIdx        = col('email')
  const sellerIdx       = col('vendedor') !== -1 ? col('vendedor') : col('seller')
  const lastPurchaseIdx = col('ultima_compra') !== -1 ? col('ultima_compra') : col('last_purchase')
  const valueIdx        = col('valor') !== -1 ? col('valor') : col('total_value')

  if (nameIdx === -1 || phoneIdx === -1) {
    return NextResponse.json({
      error: 'CSV deve ter colunas: nome, telefone (obrigatórias). Opcionais: email, vendedor, ultima_compra, valor'
    }, { status: 400 })
  }

  const svc = createServiceClient()

  // Buscar perfis (vendedores) da org por nome, para vincular owner_id aos boards
  const { data: profiles } = await svc
    .from('profiles')
    .select('id, name')
    .eq('organization_id', orgId)

  const profileMap = new Map(
    (profiles || []).map(p => [p.name?.toLowerCase().trim(), p.id])
  )

  // Cache de boards "Carteira [Vendedor]" já resolvidos nesta importação
  const boardCache = new Map<string, SellerBoardCache>()

  async function getOrCreateSellerBoard(sellerName: string): Promise<SellerBoardCache> {
    const key = sellerName.toLowerCase().trim()
    if (boardCache.has(key)) return boardCache.get(key)!

    const boardName = `Carteira ${sellerName}`
    const ownerId = profileMap.get(key) ?? null

    const { data: board } = await svc
      .from('boards')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', boardName)
      .maybeSingle()

    let boardId: string

    if (board) {
      boardId = board.id
    } else {
      const { data: newBoard, error: boardErr } = await svc
        .from('boards')
        .insert({ organization_id: orgId, name: boardName, owner_id: ownerId })
        .select('id')
        .single()

      if (boardErr || !newBoard) throw new Error(`Falha ao criar board ${boardName}: ${boardErr?.message}`)
      boardId = newBoard.id

      await svc.from('board_stages').insert([
        { board_id: boardId, organization_id: orgId, name: 'Para Contatar Hoje', order: 1 },
        { board_id: boardId, organization_id: orgId, name: 'Contatado', order: 2 },
        { board_id: boardId, organization_id: orgId, name: 'Sem Resposta', order: 3 },
        { board_id: boardId, organization_id: orgId, name: 'Recomprou', order: 4 },
      ])
    }

    // Buscar IDs dos estágios (existentes ou recém-criados)
    const { data: stages } = await svc
      .from('board_stages')
      .select('id, name')
      .eq('board_id', boardId)

    const findStage = (name: string) => stages?.find(s => s.name === name)?.id || ''

    const cacheEntry: SellerBoardCache = {
      boardId,
      ownerId,
      stages: {
        paraContatarHoje: findStage('Para Contatar Hoje'),
        contatado: findStage('Contatado'),
        semResposta: findStage('Sem Resposta'),
        recomprou: findStage('Recomprou'),
      },
    }

    boardCache.set(key, cacheEntry)
    return cacheEntry
  }

  let contactsCreated = 0
  let contactsUpdated = 0
  let dealsCreated = 0
  let dealsUpdated = 0
  let boardsCreated = 0
  let errors = 0
  const sellersProcessed = new Set<string>()

  for (const row of lines.slice(1)) {
    try {
      const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const name         = cols[nameIdx]
      const phone        = cols[phoneIdx]?.replace(/\D/g, '')
      const email        = emailIdx !== -1 ? cols[emailIdx] || null : null
      const sellerName   = sellerIdx !== -1 ? cols[sellerIdx]?.trim() || null : null
      const lastPurchase = lastPurchaseIdx !== -1 ? cols[lastPurchaseIdx] || null : null
      const totalValue   = valueIdx !== -1 ? Number(cols[valueIdx]?.replace(',', '.')) || 0 : 0

      if (!name || !phone) continue

      // ── Calcular wallet_stage e data da última compra ────────
      let walletStage = 'active'
      let lastPurchaseDate: string | null = null
      let daysSincePurchase: number | null = null

      if (lastPurchase) {
        const parsed = new Date(lastPurchase)
        if (!isNaN(parsed.getTime())) {
          lastPurchaseDate = parsed.toISOString().split('T')[0]
          daysSincePurchase = Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24))
          if (daysSincePurchase > 120)     walletStage = 'churned'
          else if (daysSincePurchase > 60) walletStage = 'inactive'
          else if (daysSincePurchase > 30) walletStage = 'at_risk'
          else                             walletStage = 'active'
        }
      }

      // ── Upsert contato (por telefone) ────────────────────────
      const sellerProfileId = sellerName ? (profileMap.get(sellerName.toLowerCase().trim()) ?? null) : null

      // Busca por telefone com ou sem prefixo +55 (banco pode normalizar o número)
      const phoneVariants = [phone, `+55${phone}`, `+${phone}`]
      const { data: existingContact } = await svc
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .in('phone', phoneVariants)
        .maybeSingle()

      let contactId: string

      if (existingContact) {
        await svc.from('contacts').update({
          name,
          ...(email && { email }),
          ...(sellerProfileId && { owner_id: sellerProfileId }),
          ...(lastPurchaseDate && { last_purchase_date: lastPurchaseDate }),
          ...(totalValue > 0 && { total_value: totalValue }),
          wallet_stage: walletStage,
        }).eq('id', existingContact.id)
        contactId = existingContact.id
        contactsUpdated++
      } else {
        const { data: newContact, error: contactErr } = await svc.from('contacts').insert({
          organization_id: orgId,
          name,
          phone,
          email,
          owner_id: sellerProfileId,
          last_purchase_date: lastPurchaseDate,
          total_value: totalValue,
          wallet_stage: walletStage,
          source: 'import',
        }).select('id').single()

        if (contactErr || !newContact) throw new Error(`Falha ao criar contato ${name}: ${contactErr?.message}`)
        contactId = newContact.id
        contactsCreated++
      }

      // ── Carteira [Vendedor]: criar board + deal ──────────────
      if (sellerName) {
        const wasNew = !boardCache.has(sellerName.toLowerCase().trim())
        const sellerBoard = await getOrCreateSellerBoard(sellerName)
        if (wasNew) {
          boardsCreated++
          sellersProcessed.add(sellerName)
        }

        // Determinar estágio do deal: "Recomprou" se comprou há <= N dias, senão "Para Contatar Hoje"
        const targetStageId = (daysSincePurchase !== null && daysSincePurchase <= RECOMPROU_DAYS_THRESHOLD)
          ? sellerBoard.stages.recomprou
          : sellerBoard.stages.paraContatarHoje

        // Verificar se já existe deal para este contato neste board
        const { data: existingDeal } = await svc
          .from('deals')
          .select('id, stage_id')
          .eq('organization_id', orgId)
          .eq('board_id', sellerBoard.boardId)
          .eq('contact_id', contactId)
          .maybeSingle()

        if (existingDeal) {
          // Reset semanal: todo card é realocado para o estágio calculado nesta importação
          // ("Recomprou" se comprou recentemente, senão "Para Contatar Hoje" — reinicia o ciclo
          // de contato do vendedor, mesmo que estivesse em "Contatado"/"Sem Resposta").
          const updates: Record<string, unknown> = { title: name, stage_id: targetStageId }
          if (totalValue > 0) updates.value = totalValue

          await svc.from('deals').update(updates).eq('id', existingDeal.id)
          dealsUpdated++
        } else {
          await svc.from('deals').insert({
            organization_id: orgId,
            board_id: sellerBoard.boardId,
            stage_id: targetStageId,
            contact_id: contactId,
            title: name,
            value: totalValue,
            owner_id: sellerBoard.ownerId,
            source: 'import',
          })
          dealsCreated++
        }
      }
    } catch (e) {
      errors++
      console.error('Erro linha:', e)
    }
  }

  // Disparar geração de tarefas após upload
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/wallet/generate-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({ organizationId: orgId }),
    })
  } catch (e) {
    console.error('Erro ao gerar tarefas:', e)
  }

  return NextResponse.json({
    success: true,
    contactsCreated,
    contactsUpdated,
    dealsCreated,
    dealsUpdated,
    boardsCreated,
    sellers: Array.from(sellersProcessed),
    errors,
    message: `${contactsCreated} contatos criados, ${contactsUpdated} atualizados | ${dealsCreated} cards criados, ${dealsUpdated} atualizados | ${boardsCreated} novos boards de carteira`,
  })
}
