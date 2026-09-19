import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import * as metaSend from '@/lib/flows/meta-send'
import * as adminClient from '@/lib/flows/admin-client'

describe('POST /api/webhooks/eve-response', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects invalid payload without "to" or "reply"', async () => {
    const req = new Request('http://localhost/api/webhooks/eve-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: '+51987654321' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Invalid payload')
  })

  it('successfully processes callback, sends to Meta, and returns 200', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnValue({
              like: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'contact-uuid-1',
                    account_id: 'account-uuid-1',
                    user_id: 'user-uuid-1',
                    phone: '+51987654321',
                    name: 'Test Contact',
                  },
                ],
                error: null,
              }),
            }),
          }
        }
        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 'conv-uuid-1',
                          ai_autoreply_disabled: false,
                          assigned_agent_id: null,
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'whatsapp_config') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { user_id: 'user-uuid-1' },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {}
      }),
    }

    vi.spyOn(adminClient, 'supabaseAdmin').mockReturnValue(mockDb as never)
    vi.spyOn(metaSend, 'engineSendText').mockResolvedValueOnce({
      whatsapp_message_id: 'wamid.EVE_REPLY_123',
    })

    const req = new Request('http://localhost/api/webhooks/eve-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: '+51987654321',
        reply: 'Hola, esta es una respuesta desde Eve',
        sessionId: 'session-123',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.whatsapp_message_id).toBe('wamid.EVE_REPLY_123')
    expect(json.conversation_id).toBe('conv-uuid-1')
    expect(json.contact_id).toBe('contact-uuid-1')

    expect(metaSend.engineSendText).toHaveBeenCalledWith({
      accountId: 'account-uuid-1',
      userId: 'user-uuid-1',
      conversationId: 'conv-uuid-1',
      contactId: 'contact-uuid-1',
      text: 'Hola, esta es una respuesta desde Eve',
      aiGenerated: true,
    })
  })
})
