// app/api/wallet/generate-tasks/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'

function getModel(provider: string, apiKey: string, model: string) {
  if (provider === 'google')    return google(model || 'gemini-1.5-flash', { apiKey })
  if (provider === 'openai')    return openai(model || 'gpt-4o-mini', { apiKey })
  if (provider === 'anthropic') return anthropic(model || 'claude-sonnet-4-6', { apiKey })
  return google('gemini-1.5-flash', { apiKey })
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret') || req.headers.get('x-cron-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { organizationId } = await req.json()
  if (!organizationId) return NextResponse.json({ error: 'organizationId obrigatório' }, { status: 400 })

  const svc = createServiceClient()

  // Buscar config de IA da org
  const { data: aiConfig } = await svc
    .from('organization_settings')
    .select('ai_provider, ai_google_key, ai_openai_key, ai_anthropic_key, ai_model, ai_enabled')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!aiConfig?.ai_enabled) {
    return NextResponse.json({ error: 'IA não habilitada para esta organização' }, { status: 422 })
  }

  // Selecionar API key pelo provider
  const apiKey = aiConfig.ai_provider === 'google'    ? aiConfig.ai_google_key
               : aiConfig.ai_provider === 'openai'    ? aiConfig.ai_openai_key
               : aiConfig.ai_provider === 'anthropic' ? aiConfig.ai_anthropic_key
               : aiConfig.ai_google_key

  if (!apiKey) return NextResponse.json({ error: 'API key de IA não configurada' }, { status: 422 })

  // Buscar vendedores
  const { data: sellers } = await svc
    .from('profiles')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('role', 'seller')

  if (!sellers?.length) return NextResponse.json({ message: 'Nenhum vendedor encontrado' })

  const today = new Date().toISOString().split('T')[0]
  let totalTasks = 0

  for (const seller of sellers) {
    // Remover tarefas IA pendentes de hoje para recriar
    await svc.from('wallet_tasks')
      .delete()
      .eq('organization_id', organizationId)
      .eq('assigned_to', seller.id)
      .eq('due_date', today)
      .eq('status', 'pending')
      .eq('ai_generated', true)

    // Buscar carteira do vendedor (usa owner_id e last_purchase_date)
    const { data: contacts } = await svc
      .from('contacts')
      .select('id, name, phone, last_purchase_date, wallet_stage')
      .eq('organization_id', organizationId)
      .eq('owner_id', seller.id)
      .not('wallet_stage', 'eq', 'churned')
      .order('last_purchase_date', { ascending: true, nullsFirst: true })
      .limit(50)

    if (!contacts?.length) continue

    // Ordenar por prioridade de risco
    const priorityOrder: Record<string, number> = { at_risk: 1, inactive: 2, active: 3 }
    const sorted = [...contacts].sort((a, b) =>
      (priorityOrder[a.wallet_stage] || 4) - (priorityOrder[b.wallet_stage] || 4)
    )
    const top10 = sorted.slice(0, 10)

    const contactList = top10.map(c => {
      const daysSince = c.last_purchase_date
        ? Math.floor((Date.now() - new Date(c.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24))
        : null
      return `- ${c.name} | Status: ${c.wallet_stage} | Última compra: ${daysSince !== null ? `${daysSince} dias atrás` : 'nunca registrada'}`
    }).join('\n')

    const model = getModel(aiConfig.ai_provider, apiKey, aiConfig.ai_model)

    let tasks: any[] = []
    try {
      const { text } = await generateText({
        model,
        prompt: `Você é um assistente de CRM especialista em retenção de clientes.
Vendedor: ${seller.name}
Data de hoje: ${today}

Carteira de clientes prioritários para contato:
${contactList}

Gere exatamente 5 tarefas de contato para hoje. Responda APENAS com JSON válido, sem texto adicional:
[
  {
    "contactName": "nome exato do contato da lista acima",
    "title": "título curto da tarefa (máx 60 chars)",
    "description": "script de abordagem em 2-3 frases mencionando o tempo sem compra",
    "priority": "high"
  }
]

Regras de prioridade:
- at_risk ou inactive com mais de 45 dias → high
- active com 20-30 dias → medium  
- active com menos de 20 dias → low`,
      })

      const clean = text.replace(/```json|```/g, '').trim()
      tasks = JSON.parse(clean)
    } catch (e) {
      console.error(`Erro IA para ${seller.name}:`, e)
      continue
    }

    for (const task of tasks) {
      const contact = contacts.find(c =>
        c.name?.toLowerCase().includes(task.contactName?.toLowerCase()?.trim())
      )
      if (!contact) continue

      await svc.from('wallet_tasks').insert({
        organization_id: organizationId,
        contact_id: contact.id,
        assigned_to: seller.id,
        title: task.title,
        description: task.description,
        priority: task.priority || 'medium',
        due_date: today,
        ai_generated: true,
        status: 'pending',
      })
      totalTasks++
    }
  }

  return NextResponse.json({
    success: true,
    totalTasks,
    sellers: sellers.length,
    message: `${totalTasks} tarefas geradas para ${sellers.length} vendedores`,
  })
}
