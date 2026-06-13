// app/api/contacts/import-wallet/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return NextResponse.json({ error: 'CSV vazio' }, { status: 400 })

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
  const col = (name: string) => headers.indexOf(name)

  const nameIdx        = col('nome') !== -1 ? col('nome') : col('name')
  const phoneIdx       = col('telefone') !== -1 ? col('telefone') : col('phone')
  const emailIdx       = col('email')
  const sellerIdx      = col('vendedor') !== -1 ? col('vendedor') : col('seller')
  const lastPurchaseIdx = col('ultima_compra') !== -1 ? col('ultima_compra') : col('last_purchase')

  if (nameIdx === -1 || phoneIdx === -1) {
    return NextResponse.json({
      error: 'CSV deve ter colunas: nome, telefone (obrigatórias). Opcionais: email, vendedor, ultima_compra'
    }, { status: 400 })
  }

  // Buscar vendedores da org por nome
  const serviceSupabase = createServiceClient()
  const { data: sellers } = await serviceSupabase
    .from('profiles')
    .select('id, name')
    .eq('organization_id', orgId)

  const sellerMap = new Map(
    (sellers || []).map(s => [s.name?.toLowerCase().trim(), s.id])
  )

  let created = 0, updated = 0, errors = 0

  for (const row of lines.slice(1)) {
    try {
      const cols        = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const name        = cols[nameIdx]
      const phone       = cols[phoneIdx]?.replace(/\D/g, '')
      const email       = emailIdx !== -1 ? cols[emailIdx] || null : null
      const sellerName  = sellerIdx !== -1 ? cols[sellerIdx] || null : null
      const lastPurchase = lastPurchaseIdx !== -1 ? cols[lastPurchaseIdx] || null : null

      if (!name || !phone) continue

      const ownerId = sellerName
        ? sellerMap.get(sellerName.toLowerCase().trim()) ?? null
        : null

      // Calcular wallet_stage pela data da última compra
      let walletStage = 'active'
      let lastPurchaseDate: string | null = null

      if (lastPurchase) {
        const parsed = new Date(lastPurchase)
        if (!isNaN(parsed.getTime())) {
          lastPurchaseDate = parsed.toISOString().split('T')[0]
          const daysSince = Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24))
          if (daysSince > 120)     walletStage = 'churned'
          else if (daysSince > 60) walletStage = 'inactive'
          else if (daysSince > 30) walletStage = 'at_risk'
          else                     walletStage = 'active'
        }
      }

      // Upsert pelo telefone
      const { data: existing } = await serviceSupabase
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('phone', phone)
        .maybeSingle()

      if (existing) {
        await serviceSupabase.from('contacts').update({
          name,
          ...(email && { email }),
          ...(ownerId && { owner_id: ownerId }),
          ...(lastPurchaseDate && { last_purchase_date: lastPurchaseDate }),
          wallet_stage: walletStage,
        }).eq('id', existing.id)
        updated++
      } else {
        await serviceSupabase.from('contacts').insert({
          organization_id: orgId,
          name,
          phone,
          email,
          owner_id: ownerId,
          last_purchase_date: lastPurchaseDate,
          wallet_stage: walletStage,
          source: 'import',
        })
        created++
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

  return NextResponse.json({ success: true, created, updated, errors,
    message: `${created} criados, ${updated} atualizados${errors > 0 ? `, ${errors} erros` : ''}` })
}
