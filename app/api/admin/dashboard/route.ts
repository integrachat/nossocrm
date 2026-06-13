// app/api/admin/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
  }

  const orgId = profile.organization_id
  const svc = createServiceClient()

  const [
    { count: totalContacts },
    { count: dealsWon },
    { data: revenueData },
    { count: whatsappWaiting },
    { data: sellerPerformance },
    { data: walletDistribution },
  ] = await Promise.all([
    svc.from('contacts').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
    svc.from('deals').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_won', true),
    svc.from('deals').select('revenue_amount').eq('organization_id', orgId).eq('is_won', true),
    svc.from('whatsapp_conversations').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'waiting'),
    svc.from('performance_by_seller').select('*').eq('organization_id', orgId),
    svc.from('contacts').select('wallet_stage').eq('organization_id', orgId).not('owner_id', 'is', null),
  ])

  const totalRevenue = (revenueData || []).reduce((sum, d) => sum + (d.revenue_amount || 0), 0)

  // Distribuição da carteira
  const walletStats = { active: 0, at_risk: 0, inactive: 0, churned: 0 }
  for (const c of (walletDistribution || [])) {
    if (c.wallet_stage in walletStats) walletStats[c.wallet_stage as keyof typeof walletStats]++
  }

  // Gerar alertas de performance
  const alerts: Array<{
    sellerId: string
    sellerName: string
    type: string
    message: string
    severity: 'high' | 'medium' | 'low'
  }> = []

  for (const seller of (sellerPerformance || [])) {
    if (seller.overdue_tasks > 3) {
      alerts.push({
        sellerId: seller.seller_id,
        sellerName: seller.seller_name,
        type: 'overdue_tasks',
        message: `${seller.overdue_tasks} tarefas vencidas sem execução`,
        severity: seller.overdue_tasks > 7 ? 'high' : 'medium',
      })
    }

    if (seller.tasks_done_week === 0 && seller.total_contacts > 0) {
      alerts.push({
        sellerId: seller.seller_id,
        sellerName: seller.seller_name,
        type: 'no_activity',
        message: 'Nenhuma tarefa concluída nos últimos 7 dias',
        severity: 'high',
      })
    }

    const riskRatio = seller.total_contacts > 0 ? seller.at_risk_contacts / seller.total_contacts : 0
    if (riskRatio > 0.4 && seller.at_risk_contacts > 5) {
      alerts.push({
        sellerId: seller.seller_id,
        sellerName: seller.seller_name,
        type: 'high_risk_wallet',
        message: `${seller.at_risk_contacts} clientes em risco (${Math.round(riskRatio * 100)}% da carteira)`,
        severity: 'medium',
      })
    }
  }

  const severityOrder = { high: 0, medium: 1, low: 2 }
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return NextResponse.json({
    summary: { totalContacts, dealsWon, totalRevenue, whatsappWaiting },
    walletDistribution: walletStats,
    sellerPerformance: sellerPerformance || [],
    alerts,
  })
}
