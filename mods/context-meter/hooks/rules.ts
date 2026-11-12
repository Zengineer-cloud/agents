// Pure logic for context-meter: number formats, bars, the estimates and when to warn.

export type Reading = { tokens: number; window: number; percent: number }

const BARS = '▁▂▃▄▅▆▇█'

export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${compact(Math.abs(n))}`

// One bar per turn, scaled to the fullest turn shown.
export function sparkline(history: readonly number[]): string {
  const max = Math.max(...history, 1)
  return history.map(t => BARS[Math.min(BARS.length - 1, Math.floor((t / max) * (BARS.length - 1)))]).join('')
}

// A bar of `cells` cells filled to `part / whole`; a sliver still shows one cell.
export function gauge(part: number, whole: number, cells: number): { filled: string; empty: string } {
  const ratio = whole > 0 ? Math.min(part / whole, 1) : 0
  const n = part > 0 ? Math.max(1, Math.round(ratio * cells)) : 0
  return { filled: '█'.repeat(n), empty: '░'.repeat(cells - n) }
}

// A rate limit's color: it only matters close to the cap.
export const level = (percent: number) => (percent >= 90 ? 'error' : percent >= 75 ? 'warning' : 'success')

// Context quality, not capacity. The 2025-2026 long-context results tie the drop
// to token counts more than to a share of the window: on 1M models recall bends
// near 128k-256k, code repair and multi-step work sooner. Each mark is the
// smaller of a token count and a share of the window, so 200k windows warn early
// too. Set a little above the measured knee: no results exist yet for the 5.x models.
export const TIERS = {
  fading: { tokens: 200_000, share: 0.35 },
  // The dumb zone, where the Handoff button turns solid: a doc, a fresh
  // context, the doc read back, each time the person asks for it, never alone.
  dumb: { tokens: 350_000, share: 0.5 },
} as const

export type Marks = { fading: number; dumb: number }

// With `autoCompactAt`, the handoff also comes before the engine's own compaction.
export function marks(window: number, autoCompactAt?: number): Marks {
  const dumb = Math.min(
    TIERS.dumb.tokens,
    Math.round(window * TIERS.dumb.share),
    autoCompactAt ? Math.round(autoCompactAt * 0.9) : Infinity,
  )
  return { fading: Math.min(TIERS.fading.tokens, Math.round(window * TIERS.fading.share), dumb), dumb }
}

// The engine's own autocompact waits for a handoff until this close to the
// window; past it, it runs so the session cannot jam.
export const forcedCompactAt = (window: number) => window - 25_000

// 0 under the fading mark, 1 fading, 2 dumb zone (the handoff).
export const stageOf = (tokens: number, m: Marks) => (tokens >= m.dumb ? 2 : tokens >= m.fading ? 1 : 0)

export const contextLevel = (tokens: number, m: Marks) =>
  tokens >= m.dumb ? 'error' : tokens >= m.fading ? 'warning' : 'success'

export type Zone = 'sharp' | 'quality fading' | 'dumb zone'

export const zoneName = (tokens: number, m: Marks): Zone =>
  tokens >= m.dumb ? 'dumb zone' : tokens >= m.fading ? 'quality fading' : 'sharp'

export function zoneHint(zone: Zone, m: Marks): string {
  if (zone === 'sharp') return `under ${compact(m.fading)}: full recall`
  if (zone === 'quality fading') return `${compact(m.fading)}–${compact(m.dumb)}: answers tend to slip`
  return `past ${compact(m.dumb)}: handoff, then a fresh context`
}

// Growth of the last turn; a negative value is a compaction.
export const lastDelta = (h: readonly number[]) => (h.length >= 2 ? h[h.length - 1]! - h[h.length - 2]! : undefined)

// Mean growth over the last few turns that grew; drops (compactions) are left out.
export function averageGrowth(h: readonly number[], turns = 5): number | undefined {
  const deltas: number[] = []
  for (let i = h.length - 1; i > 0 && deltas.length < turns; i--) {
    const d = h[i]! - h[i - 1]!
    if (d > 0) deltas.push(d)
  }
  return deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : undefined
}

// Turns of average growth until `limit` (the handoff, or a forced compact).
export function turnsLeft(tokens: number, limit: number, growth: number | undefined): number | undefined {
  if (growth === undefined || growth <= 0) return undefined
  return Math.max(0, Math.floor((limit - tokens) / growth))
}

const LIMIT_NAMES: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }
export const limitName = (kind: string) => LIMIT_NAMES[kind] ?? kind

// "in 2h 10m" for a reset within a day, else the weekday.
export function resetIn(iso: string | undefined, now: number): string | undefined {
  if (iso === undefined) return undefined
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return undefined
  const mins = Math.max(0, Math.round((at - now) / 60_000))
  if (mins < 60) return `in ${mins}m`
  if (mins < 24 * 60) return `in ${Math.floor(mins / 60)}h ${mins % 60}m`
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(at).getDay()]
}

// One limit as the band shows it. The engine's figure only moves on a response,
// so a window whose reset time has passed still carries the old percent while
// the session sits idle: show it as fresh (0%, "reset") until the next reading.
export function limitRow(
  l: { kind: string; percent: number; resetsAt?: string },
  now: number,
): { name: string; percent: number; reset?: string } {
  const at = l.resetsAt === undefined ? NaN : Date.parse(l.resetsAt)
  if (!Number.isNaN(at) && at <= now) return { name: limitName(l.kind), percent: 0, reset: 'just now' }
  return { name: limitName(l.kind), percent: l.percent, reset: resetIn(l.resetsAt, now) }
}

// The last two path parts: `.claude/CLAUDE.md`.
export const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).slice(-2).join('/')

// ── model and effort ──────────────────────────────────────────────────────────

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

// The `/config` model row's value, `opus[1m]`, as a family and its 1M flag.
export function parseAlias(alias: string): { family: string; isLong: boolean } {
  const m = /^(.*?)(\[1m\])?$/i.exec(alias.trim())
  return { family: (m?.[1] ?? alias).toLowerCase(), isLong: Boolean(m?.[2]) }
}

// The families a button can pick, in the menu's order: plain aliases that are
// not presets (`default`, `best`, `opusplan`).
const PRESETS = new Set(['default', 'best', 'opusplan'])
export const families = (options: readonly string[]) =>
  options.filter(o => !o.includes('[') && !PRESETS.has(o.toLowerCase()))

// The live model id as a `/model` alias: `claude-opus-5-5[1m]` → `opus[1m]`;
// undefined for an id that names no family.
export function aliasOf(id: string): string | undefined {
  const m = /^claude-([a-z]+)-.*?(\[1m\])?$/i.exec(id.trim())
  return m ? `${m[1]!.toLowerCase()}${m[2] ? '[1m]' : ''}` : undefined
}

// The alias to set for a family, keeping the 1M window when that family has one.
export function aliasFor(family: string, isLong: boolean, options: readonly string[]): string {
  const long = `${family}[1m]`
  return isLong && options.includes(long) ? long : family
}

// `claude-opus-5-5` → `Opus 5.5`; an alias or unknown id comes back capitalised.
export function modelName(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/i.exec(id)
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  if (!m) return cap(id.replace(/\[1m\]$/i, ''))
  const version = m[3] && m[3].length <= 2 ? `${m[2]}.${m[3]}` : m[2]
  return `${cap(m[1]!)} ${version}`
}

// ── bars ──────────────────────────────────────────────────────────────────────

// Every figure and name on the band is real text, which the surface sizes,
// wraps and reads aloud. An image holds only a bar, so it has no text to blur
// when scaled (WCAG 1.4.9). The bar colors keep 3:1 against light and dark
// app backgrounds (WCAG 1.4.11); tests/rules.test.ts checks each one. A bar's
// meaning never rests on its color: the zone has a word and a shape, and each
// bar has its figure beside it.
export const PALETTE = {
  light: { ok: '#1a7f37', warn: '#9a6700', bad: '#cf222e', neutral: '#57606a', edge: '#6e7781' },
  dark: { ok: '#3fb950', warn: '#d29922', bad: '#f85149', neutral: '#9198a1', edge: '#8b949e' },
} as const

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral'

const TONES = { success: 'ok', warning: 'warn', error: 'bad' } as const
export const toneOf = (l: 'success' | 'warning' | 'error'): Tone => TONES[l]

// A shape per zone, so the zone reads without its color.
const GLYPHS: Record<Zone, string> = { sharp: '●', 'quality fading': '▲', 'dumb zone': '■' }
export const zoneGlyph = (zone: Zone) => GLYPHS[zone]

export type Bar = {
  // 0 to 1; a value above 0 always draws a sliver.
  ratio: number
  tone: Tone
  width: number
  // Marks along the bar, each 0 to 1 (the quality marks on the context bar).
  ticks?: readonly number[]
  // solid: a filled bar. hatched: reserved space. hollow: free space, an outline.
  style?: 'solid' | 'hatched' | 'hollow'
}

const BAR = { h: 12, y: 3, track: 6 } as const

// One thin bar on an outlined track. No text: the caller draws the figures.
export function barSvg(b: Bar): string {
  const W = b.width
  const { h: H, y, track } = BAR
  const ratio = Math.max(0, Math.min(b.ratio, 1))
  const filled = ratio > 0 ? Math.max(2, (W - 2) * ratio) : 0
  const style = b.style ?? 'solid'
  const fill =
    style === 'hollow' || filled === 0
      ? ''
      : `<rect x="1" y="${y}" width="${filled.toFixed(1)}" height="${track}" rx="2" ${
          style === 'hatched' ? 'fill="url(#hatch)"' : `class="${b.tone}"`
        }/>`
  const ticks = (b.ticks ?? []).map(t => {
    const x = 1 + (W - 2) * Math.max(0, Math.min(t, 1))
    return `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke-width="1.5" class="tick"/>`
  })
  const css = (p: (typeof PALETTE)['light' | 'dark']) =>
    `.ok{fill:${p.ok}}.warn{fill:${p.warn}}.bad{fill:${p.bad}}.neutral{fill:${p.neutral}}` +
    `.hatch{fill:${p.neutral}}.track{fill:none;stroke:${p.edge}}.tick{stroke:${p.edge}}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<style>${css(PALETTE.light)}@media (prefers-color-scheme: dark){${css(PALETTE.dark)}}</style>` +
    (style === 'hatched'
      ? `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">` +
        `<rect width="2" height="4" class="hatch"/></pattern></defs>`
      : '') +
    fill +
    `<rect x="0.5" y="${y - 0.5}" width="${W - 1}" height="${track + 1}" rx="2.5" stroke-width="1" class="track"/>` +
    ticks.join('') +
    `</svg>`
  )
}

// ── the breakdown ─────────────────────────────────────────────────────────────

export type Segment = { name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' }

// The /context rows as Details shows them: the largest used ones, then the
// small ones (under 1% of the window) summed as Other, then the buffer and
// the free space. Rows of 0% say nothing, so none are left.
export function segments(categories: readonly Segment[], window: number, most = 5): Segment[] {
  const used = categories.filter(c => c.kind === 'used').sort((a, z) => z.tokens - a.tokens)
  const shown = used.filter((c, i) => i < most && c.tokens >= window * 0.01)
  const small = used.filter(c => !shown.includes(c)).reduce((n, c) => n + c.tokens, 0)
  return [
    ...shown,
    ...(small > 0 ? [{ name: 'Other', tokens: small, color: 'inactive', kind: 'used' as const }] : []),
    ...categories.filter(c => c.kind === 'buffer'),
    ...categories.filter(c => c.kind === 'free'),
  ]
}

// ── the prompt cache ──────────────────────────────────────────────────────────

// A request's input, by what the prompt cache did with it: served from the
// cache (cheap), written to it (a little dearer than plain input), or neither.
export type CacheCount = { read: number; written: number; fresh: number }

export const cacheCount = (u: {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}): CacheCount => ({ read: u.cache_read_input_tokens, written: u.cache_creation_input_tokens, fresh: u.input_tokens })

export const addCount = (a: CacheCount, b: CacheCount): CacheCount => ({
  read: a.read + b.read,
  written: a.written + b.written,
  fresh: a.fresh + b.fresh,
})

// The share of the input the cache served, 0 to 100; undefined with no input.
export function cacheShare(c: CacheCount): number | undefined {
  const input = c.read + c.written + c.fresh
  return input > 0 ? Math.round((c.read / input) * 100) : undefined
}

export function cacheLine(c: CacheCount): { lead: string; rest: string } | undefined {
  const share = cacheShare(c)
  if (share === undefined) return undefined
  return {
    lead: `${share}% from cache`,
    rest: ` · ${compact(c.read)} read · ${compact(c.written)} written · ${compact(c.fresh)} new`,
  }
}

// How long an idle cache entry lives. The engine does not report it, so it is
// read off the plan: a subscription seat (it has 5h or 7d limits) keeps an
// entry about an hour, API and cloud-provider billing five minutes. The
// `cacheTtlMinutes` option overrides the guess.
export type CacheTtl = { ms: number; source: 'option' | 'plan' | 'default' }

export function cacheTtl(limits: readonly { kind: string }[], optionMinutes?: number): CacheTtl {
  if (optionMinutes !== undefined && optionMinutes > 0) return { ms: optionMinutes * 60_000, source: 'option' }
  const isSeat = limits.some(l => l.kind === 'five_hour' || l.kind === 'seven_day')
  return isSeat ? { ms: 60 * 60_000, source: 'plan' } : { ms: 5 * 60_000, source: 'default' }
}

const TTL_SOURCE = { option: 'set in options', plan: 'subscription plan', default: 'API default' } as const

export function lifetimeText(ttl: CacheTtl): { lead: string; rest: string } {
  const mins = Math.round(ttl.ms / 60_000)
  const lead = mins === 60 ? '1 hour' : mins % 60 === 0 ? `${mins / 60} hours` : `${mins} minutes`
  return { lead, rest: ` · ${TTL_SOURCE[ttl.source]}` }
}

// Whether the next message still finds the cache. While a turn runs each
// request renews it; idle, it runs down from the last response.
export function cacheStateText(
  ttl: CacheTtl,
  lastResponseAt: number | undefined,
  now: number,
  tokens: number,
  isWorking: boolean,
): { lead: string; rest: string } {
  if (lastResponseAt === undefined) return { lead: 'no response yet', rest: '' }
  if (isWorking) return { lead: 'warm', rest: ' · renewed by each request' }
  const left = ttl.ms - (now - lastResponseAt)
  if (left <= 0) return { lead: 'expired', rest: ` · the next message re-reads ${compact(tokens)} at full price` }
  const mins = Math.floor(left / 60_000)
  return { lead: 'warm', rest: mins < 1 ? ' · under a minute left if idle' : ` · about ${mins}m left if idle` }
}

// The highest stage newly reached (1 fading, 2 dumb zone), or undefined. A drop
// (after a compaction) re-arms the stages above the new reading.
export function crossed(stage: number, warned: number): { level?: number; warned: number } {
  if (stage > warned) return { level: stage, warned: stage }
  return { warned: Math.min(warned, stage) }
}

export function warning(stage: number, r: Reading, m: Marks): string {
  const fill = `Context holds ${compact(r.tokens)} (${r.percent}% of ${compact(r.window)}).`
  if (stage >= 2)
    return `${fill} Past ${compact(m.dumb)} is the dumb zone: recall and reasoning drop, and each turn costs more. Press Handoff (or type /handoff) at a good stopping point: Claude writes a state doc, the context is cleared, and Claude reads the doc back.`
  return `${fill} Past ${compact(m.fading)}, answer quality tends to slip. The dumb zone starts at ${compact(m.dumb)}; Handoff is yours to press.`
}

// A session that loaded a smaller compaction window than the model has (an old
// `autoCompactWindow`, say) keeps it for the life of its process: `/clear` and
// the handoff keep the process, so only a new chat loads the model's own.
// Undefined when the two are close.
export function windowNote(loaded: number | undefined, model: number): string | undefined {
  if (loaded === undefined || loaded >= model * 0.9) return undefined
  return `This chat loaded a ${compact(loaded)} window from an old setting. The handoff keeps it; a new chat gets the full ${compact(model)}.`
}

// The tokens every request carries before the conversation itself: the system
// prompt, tool schemas, memory files, MCP tools. Paid on every turn.
export const baseline = (categories: readonly { name: string; tokens: number; kind: string }[]) =>
  categories.filter(c => c.kind === 'used' && !/^messages$/i.test(c.name)).reduce((n, c) => n + c.tokens, 0)

// ── the handoff ───────────────────────────────────────────────────────────────

export const HANDOFF_COMMAND = {
  name: 'handoff',
  description: 'Write a state doc, clear the context, read the doc back (context-meter).',
} as const

// Working notes in the repo, never committed (the folder ignores itself).
export const HANDOFF_DIR = '.claude/handoff'

// `2026-10-06-1000-abcdef12.md`: the time (UTC) keeps a retry from writing over
// a good doc from earlier the same day.
export function handoffPath(root: string, sessionId: string, now: number): string {
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const iso = new Date(now).toISOString()
  return `${base}/${HANDOFF_DIR}/${iso.slice(0, 10)}-${iso.slice(11, 16).replace(':', '')}-${sessionId.slice(0, 8)}.md`
}

export const handoffPrompt = (path: string, r: Reading) =>
  [
    `Context holds ${compact(r.tokens)} tokens. Before this context is cleared, write a handoff doc to ${path} with the Write tool (replace the file if it exists).`,
    'Write it for a fresh session that has none of this conversation. Use these sections:',
    '1. Goal: what the user wants, in their words where it matters.',
    '2. Current state: what is done, what is in progress, the branch and uncommitted changes.',
    '3. Decisions: what was chosen and why, and what the user rejected.',
    '4. Key files: each path with one line on its role.',
    '5. Open problems: errors seen, approaches that failed, gotchas.',
    '6. Next steps: numbered, the very next action first.',
    'Keep it under 300 lines. Do not start new work. When it is written, reply with one line.',
  ].join('\n')

// For the fallback, when `/clear` is refused.
export const compactInstructions = (path: string) =>
  `A handoff doc for this session is at ${path}. Name that path in the summary as the source of truth for state and next steps. Keep the user's latest request and any question still open to them.`

export const readPrompt = (path: string, how: 'cleared' | 'compacted') =>
  [
    `The context was just ${how} for a handoff. Read the handoff doc at ${path}.`,
    'Check it against the repo: git status, and the files it names.',
    'Then say in a few lines what is stale or wrong, and what the next step is. Wait for me before you start it.',
  ].join('\n')
