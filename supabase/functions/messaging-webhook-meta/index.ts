// supabase/functions/messaging-webhook-meta/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const META_VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

serve(async (req) => {
  // ── Verificação do webhook (GET) ──────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body: any
  try { body = await req.json() } catch { return new Response('OK', { status: 200 }) }

  try {
    const message       = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    const phoneNumberId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id

    if (!message || !phoneNumberId) return new Response('OK', { status: 200 })

    const fromPhone   = message.from
    const messageText = message?.text?.body || '[Mídia recebida]'
    const waMessageId = message.id

    // ── Identificar organização pelo phone_number_id ──────────
    const { data: orgSettings } = await supabase
      .from('organization_settings')
      .select('organization_id')
      .eq('meta_phone_number_id', phoneNumberId)
      .maybeSingle()

    if (!orgSettings) {
      console.log(`Org não encontrada para phone_number_id: ${phoneNumberId}`)
      return new Response('OK', { status: 200 })
    }

    const orgId = orgSettings.organization_id

    // ── Verificar conversa ativa existente ───────────────────
    const { data: existingConv } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('organization_id', orgId)
      .eq('wa_phone_number', fromPhone)
      .in('status', ['waiting', 'active'])
      .maybeSingle()

    if (existingConv) {
      await supabase.from('whatsapp_conversations')
        .update({ last_message: messageText, last_message_at: new Date().toISOString() })
        .eq('id', existingConv.id)

      await supabase.from('whatsapp_messages').insert({
        conversation_id: existingConv.id,
        organization_id: orgId,
        direction: 'inbound',
        content: messageText,
        wa_message_id: waMessageId,
      })
      return new Response('OK', { status: 200 })
    }

    // ── Buscar ou criar contato ───────────────────────────────
    let { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('phone', fromPhone)
      .maybeSingle()

    if (!contact) {
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({ organization_id: orgId, name: fromPhone, phone: fromPhone, source: 'whatsapp' })
        .select('id, name')
        .single()
      contact = newContact
    }

    // ── Buscar board Televendas e estágio Aguardando ──────────
    const { data: board } = await supabase
      .from('boards')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', 'Televendas')
      .maybeSingle()

    if (!board) {
      console.log(`Board Televendas não encontrado para org ${orgId}`)
      return new Response('OK', { status: 200 })
    }

    const { data: stage } = await supabase
      .from('board_stages')
      .select('id')
      .eq('board_id', board.id)
      .eq('name', 'Aguardando')
      .maybeSingle()

    if (!stage) {
      console.log(`Estágio Aguardando não encontrado`)
      return new Response('OK', { status: 200 })
    }

    // ── Criar deal no pipeline Televendas ────────────────────
    const { data: deal } = await supabase
      .from('deals')
      .insert({
        organization_id: orgId,
        board_id: board.id,
        stage_id: stage.id,
        contact_id: contact!.id,
        title: `WhatsApp - ${contact!.name}`,
        source: 'whatsapp',
        status: 'open',
      })
      .select('id')
      .single()

    // ── Criar conversa vinculada ao deal ─────────────────────
    const { data: conv } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,
        deal_id: deal!.id,
        contact_id: contact!.id,
        wa_phone_number: fromPhone,
        wa_message_id: waMessageId,
        status: 'waiting',
        last_message: messageText,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    await supabase.from('whatsapp_messages').insert({
      conversation_id: conv!.id,
      organization_id: orgId,
      direction: 'inbound',
      content: messageText,
      wa_message_id: waMessageId,
    })

    console.log(`Nova conversa criada: conv=${conv!.id} deal=${deal!.id}`)
  } catch (err) {
    console.error('Erro webhook:', err)
  }

  return new Response('OK', { status: 200 })
})
