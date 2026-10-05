// The one request the coach makes: a turn of conversation to Anthropic's Messages API, sent
// straight from this device with the person's own key. No server of ours is in between.
import type { ToolDef } from './tools'

export const MODELS = [
  { value: 'claude-opus-5-5', label: 'Opus', note: 'The most capable. Costs the most per message.' },
  { value: 'claude-sonnet-5-5', label: 'Sonnet', note: 'Nearly as good at planning, several times cheaper.' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku', note: 'The fastest and cheapest. Fine for small changes.' },
] as const
export type Model = (typeof MODELS)[number]['value']
export const DEFAULT_MODEL: Model = 'claude-opus-5-5'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
export interface Message { role: 'user' | 'assistant'; content: string | Block[] }

export type CoachFailure = 'key' | 'credit' | 'offline' | 'busy' | 'other'
export class CoachError extends Error {
  constructor(public kind: CoachFailure, message: string) { super(message) }
}

const URL = 'https://api.anthropic.com/v1/messages'
const TIMEOUT_MS = 120_000

export async function ask(opts: {
  key: string
  model: Model
  /** the fixed instructions, then what changes every turn */
  system: [string, string]
  messages: Message[]
  tools: ToolDef[]
}): Promise<{ content: Block[]; stop: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.key,
        'anthropic-version': '2023-06-01',
        // The key is the person's own and never leaves their device except to Anthropic, which
        // is the case this header exists to allow.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 4096,
        // The instructions and the tools are the same every turn, so they are cached; only the
        // profile after them is read fresh.
        system: [
          { type: 'text', text: opts.system[0], cache_control: { type: 'ephemeral' } },
          { type: 'text', text: opts.system[1] },
        ],
        tools: opts.tools,
        messages: opts.messages,
      }),
    })
  } catch {
    throw new CoachError('offline', 'Could not reach Anthropic. Check your connection and try again.')
  } finally {
    clearTimeout(timer)
  }

  let body: any = null
  try { body = await res.json() } catch { /* an error page, not JSON */ }
  if (res.ok && body && Array.isArray(body.content)) {
    const content = (body.content as any[]).filter(b => b && (b.type === 'text' || b.type === 'tool_use')) as Block[]
    return { content, stop: String(body.stop_reason || '') }
  }

  const detail: string = body?.error?.message || ''
  if (res.status === 401 || res.status === 403) throw new CoachError('key', 'Anthropic did not accept this API key. Check it in Settings.')
  if (/credit balance/i.test(detail)) throw new CoachError('credit', 'Your Anthropic account has no credit left. Add some at console.anthropic.com, under Billing.')
  if (res.status === 429) throw new CoachError('busy', 'Too many messages at once for your Anthropic account. Wait a moment and try again.')
  if (res.status >= 500) throw new CoachError('busy', 'Anthropic is busy right now. Try again in a moment.')
  if (res.status === 404) throw new CoachError('other', 'Your Anthropic account cannot use this model. Choose another one in Settings.')
  throw new CoachError('other', detail || `Anthropic answered with an error (${res.status}).`)
}
