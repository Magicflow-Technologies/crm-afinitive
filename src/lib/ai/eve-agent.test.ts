import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dispatchInboundToEve } from './eve-agent'

describe('dispatchInboundToEve', () => {
  const originalEnv = process.env.EVE_AGENT_WEBHOOK_URL

  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.EVE_AGENT_WEBHOOK_URL
  })

  afterEach(() => {
    process.env.EVE_AGENT_WEBHOOK_URL = originalEnv
  })

  it('dispatches payload to default Eve URL when env var is not set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response)

    const result = await dispatchInboundToEve({
      from: '+51987654321',
      message: 'Hola, quiero información',
      name: 'Juan Perez',
    })

    expect(result).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://agent-afinitive.vercel.app/api/webhook/crm',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '+51987654321',
          message: 'Hola, quiero información',
          name: 'Juan Perez',
        }),
      })
    )
  })

  it('dispatches payload to custom EVE_AGENT_WEBHOOK_URL when provided', async () => {
    process.env.EVE_AGENT_WEBHOOK_URL = 'https://custom-agent.example.com/webhook'

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response)

    const result = await dispatchInboundToEve({
      from: '+51987654321',
      message: 'Mensaje de prueba',
    })

    expect(result).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://custom-agent.example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          from: '+51987654321',
          message: 'Mensaje de prueba',
        }),
      })
    )
  })

  it('handles fetch failure gracefully without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    const result = await dispatchInboundToEve({
      from: '+51987654321',
      message: 'Test message',
    })

    expect(result).toBe(false)
  })
})
