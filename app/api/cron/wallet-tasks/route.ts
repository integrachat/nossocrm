/**
 * GET /api/cron/wallet-tasks
 *
 * Cron diário que gera tarefas de contato com a carteira para todos os vendedores.
 * Roda todos os dias às 09:00 UTC (06:00 BRT) para que as tarefas estejam
 * prontas quando o vendedor abrir o CRM pela manhã.
 *
 * Protegido por CRON_SECRET — apenas chamável pelo Vercel Cron.
 */

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Buscar todas as organizações com IA habilitada
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: orgs } = await supabase
    .from('organization_settings')
    .select('organization_id')
    .eq('ai_enabled', true)

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: 'Nenhuma organização com IA habilitada', processed: 0 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crmlivaar.vercel.app'
  const internalSecret = process.env.INTERNAL_API_SECRET || ''

  let totalTasks = 0
  let errors = 0

  for (const org of orgs) {
    try {
      const res = await fetch(`${baseUrl}/api/wallet/generate-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret,
        },
        body: JSON.stringify({ organizationId: org.organization_id }),
      })

      if (res.ok) {
        const data = await res.json()
        totalTasks += data.totalTasks || 0
        console.log(`[Cron:wallet-tasks] Org ${org.organization_id}: ${data.totalTasks} tarefas geradas`)
      } else {
        console.error(`[Cron:wallet-tasks] Org ${org.organization_id}: erro ${res.status}`)
        errors++
      }
    } catch (e) {
      console.error(`[Cron:wallet-tasks] Org ${org.organization_id}: exceção`, e)
      errors++
    }
  }

  console.log(`[Cron:wallet-tasks] Concluído — ${totalTasks} tarefas geradas, ${errors} erros`)
  return NextResponse.json({
    success: true,
    organizations: orgs.length,
    totalTasks,
    errors,
  })
}
