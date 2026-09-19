export interface EveWebhookPayload {
  from: string
  message: string
  name?: string
}

/**
 * Dispatch an inbound customer message to the external Eve AI agent orchestrator.
 * 
 * Target URL defaults to process.env.EVE_AGENT_WEBHOOK_URL or the fallback URL.
 */
export async function dispatchInboundToEve(payload: EveWebhookPayload): Promise<boolean> {
  const eveWebhookUrl =
    process.env.EVE_AGENT_WEBHOOK_URL || 'https://agent-afinitive.vercel.app/api/webhook/crm'

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(eveWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: payload.from,
        message: payload.message,
        ...(payload.name ? { name: payload.name } : {}),
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error(
        `[eve-agent] HTTP error when dispatching to Eve: ${response.status} ${response.statusText}`
      )
      return false
    }

    console.info(`[eve-agent] Successfully dispatched message from ${payload.from} to Eve`)
    return true
  } catch (error) {
    console.error(
      '[eve-agent] Failed to dispatch message to Eve agent:',
      error instanceof Error ? error.message : error
    )
    return false
  }
}
