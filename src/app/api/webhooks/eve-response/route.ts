import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { engineSendText } from '@/lib/flows/meta-send'
import { normalizePhone, phonesMatch } from '@/lib/whatsapp/phone-utils'

interface EveCallbackPayload {
  to?: string
  reply?: string
  sessionId?: string
}

interface ContactRecord {
  id: string
  account_id: string
  user_id: string
  phone: string
  name?: string | null
}

export async function POST(request: Request) {
  try {
    const body: EveCallbackPayload | null = await request.json().catch(() => null)

    if (!body || !body.to || typeof body.reply !== 'string' || !body.reply.trim()) {
      return NextResponse.json(
        { error: 'Invalid payload: "to" (string) and non-empty "reply" (string) are required' },
        { status: 400 }
      )
    }

    const { to, reply } = body
    const normalizedTo = normalizePhone(to)

    if (!normalizedTo) {
      return NextResponse.json(
        { error: 'Invalid phone number in "to"' },
        { status: 400 }
      )
    }

    const db = supabaseAdmin()

    // 1. Locate contact by phone matching
    const suffix = normalizedTo.length >= 8 ? normalizedTo.slice(-8) : normalizedTo
    const { data: contacts, error: contactErr } = await db
      .from('contacts')
      .select('id, account_id, user_id, phone, name')
      .like('phone', `%${suffix}`)

    if (contactErr) {
      console.error('[eve-response] Error querying contacts:', contactErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    let contact: ContactRecord | undefined = (contacts as ContactRecord[] | null)?.find(
      (c) => phonesMatch(c.phone, to)
    )

    // Fallback: If contact doesn't exist yet, attempt to link with existing whatsapp_config
    if (!contact) {
      const { data: configs, error: configListErr } = await db
        .from('whatsapp_config')
        .select('account_id, user_id')
        .limit(1)

      if (configListErr || !configs || configs.length === 0) {
        return NextResponse.json(
          { error: `Contact not found for phone ${to} and no WhatsApp config found` },
          { status: 404 }
        )
      }

      const cfg = configs[0]
      const { data: createdContact, error: createErr } = await db
        .from('contacts')
        .insert({
          account_id: cfg.account_id,
          user_id: cfg.user_id,
          phone: to,
          name: to,
        })
        .select()
        .single()

      if (createErr || !createdContact) {
        console.error('[eve-response] Error creating missing contact:', createErr)
        return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 })
      }

      contact = createdContact as ContactRecord
    }

    if (!contact) {
      return NextResponse.json(
        { error: `Contact not found for phone ${to}` },
        { status: 404 }
      )
    }

    const activeContact: ContactRecord = contact

    // 2. Find or create conversation for this contact
    const { data: existingConvs, error: convErr } = await db
      .from('conversations')
      .select('id, ai_autoreply_disabled, assigned_agent_id')
      .eq('account_id', activeContact.account_id)
      .eq('contact_id', activeContact.id)
      .order('created_at', { ascending: true })
      .limit(1)

    if (convErr) {
      console.error('[eve-response] Error finding conversation:', convErr)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    let resolvedConversationId: string | null =
      existingConvs && existingConvs.length > 0 ? existingConvs[0].id : null

    if (!resolvedConversationId) {
      const { data: newConv, error: newConvErr } = await db
        .from('conversations')
        .insert({
          account_id: activeContact.account_id,
          user_id: activeContact.user_id,
          contact_id: activeContact.id,
        })
        .select('id')
        .single()

      if (newConvErr || !newConv) {
        console.error('[eve-response] Error creating conversation:', newConvErr)
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }
      resolvedConversationId = newConv.id
    }

    if (!resolvedConversationId) {
      return NextResponse.json({ error: 'Failed to resolve conversation' }, { status: 500 })
    }

    const conversationId: string = resolvedConversationId

    // 3. Resolve config owner user_id for auditing
    const { data: config } = await db
      .from('whatsapp_config')
      .select('user_id')
      .eq('account_id', activeContact.account_id)
      .maybeSingle()

    const configOwnerUserId = config?.user_id || activeContact.user_id

    // 4. Dispatch outbound text message via WhatsApp Meta API and persist to DB
    const sendResult = await engineSendText({
      accountId: activeContact.account_id,
      userId: configOwnerUserId,
      conversationId,
      contactId: activeContact.id,
      text: reply.trim(),
      aiGenerated: true,
    })

    return NextResponse.json({
      success: true,
      whatsapp_message_id: sendResult.whatsapp_message_id,
      conversation_id: conversationId,
      contact_id: activeContact.id,
    })
  } catch (error) {
    console.error('[eve-response] Error processing Eve response callback:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
