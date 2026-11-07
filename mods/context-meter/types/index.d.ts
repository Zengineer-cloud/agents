export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Meter = {
  tokens: number
  // The model's full window; the meter's percent is a share of it.
  window: number
  percent: number
  // Tokens after each main-loop turn, newest last.
  history: number[]
  limits: Limit[]
  usd?: number
}

export type Category = { name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' }

// The /context breakdown, estimated locally; refreshed at turn end and on expand.
export type Detail = {
  // The window the session compacts against: the model's limit, or a smaller
  // one from settings or the env (`autoCompactWindow`), as /context reports it.
  window: number
  windowSource: string
  categories: Category[]
  autoCompactAt?: number
  // Share of the last request's input served from the prompt cache, 0 to 100.
  cacheHit?: number
  memoryFiles: { path: string; tokens: number }[]
  mcpTokens: number
}

// What the model and effort buttons show and set.
export type Setup = {
  // The `/config` model row: its value (`opus[1m]`) and its choices.
  alias?: string
  options: string[]
  // The last main-loop request's resolved model id and effort.
  model?: string
  effort?: string | number
}

// A handoff in progress: queued for the end of the turn, the doc being written,
// the context being cleared, then the doc read back. `/clear` starts a new
// session with empty state, so the read-back step sets its phase afresh.
export type Handoff = {
  phase: 'queued' | 'writing' | 'clearing' | 'reading'
  path?: string
  // When the doc was asked for; a doc older than this is stale.
  since?: number
  // Turns ended while waiting for the doc; it gives up after two.
  waited?: number
}

// A warning sign the token count misses: repeated corrections, a loop, a large
// context left idle near the cache expiry, or "done" said late in a long one.
export type Signal = { kind: 'corrections' | 'loop' | 'idle' | 'done'; text: string }

declare module 'claude-code' {
  interface PluginState {
    'context-meter': {
      meter: Meter | null
      detail: Detail | null
      setup: Setup | null
      isOpen: boolean
      warned: number
      handoff: Handoff | null
      signal: Signal | null
    }
  }
}
