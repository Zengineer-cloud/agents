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

// ── the desktop strip ─────────────────────────────────────────────────────────

const COLORS = { success: '#2ea043', warning: '#d29922', error: '#f85149' } as const

export type Strip = {
  percent: number
  tokens: number
  window: number
  // The session's marks; the window's own when absent.
  marks?: Marks
  limits: { name: string; percent: number; reset?: string }[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The strip's grid, in viewBox units: one line, the context on the left and a
// block per rate limit on the right. Drawn as an image at this size (its text
// then matches the band's), scaled down when the slot is narrower.
const STRIP = {
  w: 880,
  h: 26,
  // Text baseline; the bars sit on the text's middle.
  y: 18,
  bar: { x: 104, w: 260, h: 4 },
  percentX: 376,
  // The hairline between the context and the limits.
  ruleX: 436,
  limits: { x: 456, step: 212, bar: 64 },
} as const

// A reset as the strip shows it: "4h 58m", "Tue", "reset".
const shortReset = (reset: string | undefined) =>
  reset === undefined ? '' : reset === 'just now' ? 'reset' : reset.replace(/^in /, '')

// One line of thin bars: the token figures, the context bar with ticks at the
// quality marks, the percent, then each rate limit with its reset. The zone's
// meaning and the full reset times live in Details. Colors follow light or dark.
export function stripSvg(c: Strip): string {
  const { w: W, h: H, y, bar, limits } = STRIP
  const m = c.marks ?? marks(c.window)
  const color = COLORS[contextLevel(c.tokens, m)]
  const fill = Math.min(c.percent, 100) / 100
  const barY = y - 7
  const ticks = [m.fading, m.dumb].map(t => {
    const x = bar.x + (bar.w * Math.min(t, c.window)) / c.window
    return `<line x1="${x.toFixed(1)}" y1="${barY - 3}" x2="${x.toFixed(1)}" y2="${barY + bar.h + 3}" stroke-width="1" class="tick"/>`
  })
  const blocks = c.limits.slice(0, 2).map((l, i) => {
    const x = limits.x + i * limits.step
    const lc = COLORS[level(l.percent)]
    return (
      `<text x="${x}" y="${y}" font-size="14" class="m">${esc(l.name)}</text>` +
      `<rect x="${x + 26}" y="${barY}" width="${limits.bar}" height="${bar.h}" rx="2" class="track"/>` +
      `<rect x="${x + 26}" y="${barY}" width="${Math.max(2, (limits.bar * Math.min(l.percent, 100)) / 100).toFixed(1)}" height="${bar.h}" rx="2" fill="${lc}"/>` +
      `<text x="${x + 100}" y="${y}" font-size="14" font-weight="600" class="t">${Math.round(l.percent)}%</text>` +
      `<text x="${x + 144}" y="${y}" font-size="14" class="m">${esc(fit(shortReset(l.reset), limits.step - 150, 14))}</text>`
    )
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<style>.t{fill:#1f2328}.m{fill:#59636e}.track{fill:#d1d9e0}.tick{stroke:#59636e}.rule{stroke:#d1d9e0}` +
    `@media (prefers-color-scheme: dark){.t{fill:#e6edf3}.m{fill:#9198a1}.track{fill:#3d444d}.tick{stroke:#9198a1}.rule{stroke:#3d444d}}` +
    `text{font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif}</style>` +
    `<text x="0" y="${y}" font-size="16" font-weight="600" class="t">${esc(compact(c.tokens))}` +
    `<tspan class="m" font-size="14" font-weight="400"> / ${esc(compact(c.window))}</tspan></text>` +
    `<rect x="${bar.x}" y="${barY}" width="${bar.w}" height="${bar.h}" rx="2" class="track"/>` +
    `<rect x="${bar.x}" y="${barY}" width="${c.tokens > 0 ? Math.max(2, bar.w * fill).toFixed(1) : 0}" height="${bar.h}" rx="2" fill="${color}"/>` +
    ticks.join('') +
    `<text x="${STRIP.percentX}" y="${y}" font-size="14" font-weight="600" fill="${color}">${c.percent}%</text>` +
    (blocks.length
      ? `<line x1="${STRIP.ruleX}" y1="6" x2="${STRIP.ruleX}" y2="${H - 4}" stroke-width="1" class="rule"/>`
      : '') +
    blocks.join('') +
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

// The used segments' colors, by rank: the engine's colors are theme keys,
// which an image cannot read. Other is always gray.
const SEGMENT_COLORS = ['#7f77dd', '#1d9e75', '#d85a30', '#378add', '#ba7517'] as const
const OTHER_COLOR = '#888780'

const LEGEND = { w: 880, cols: 4, row: 22, barH: 8, gap: 12 } as const

// One stacked bar of the whole window (used segments, the buffer hatched at
// the end, free space as the bare track) and a legend under it, four to a row.
export function breakdownSvg(parts: readonly Segment[], window: number): string {
  const { w: W, cols, row, barH, gap } = LEGEND
  const colW = W / cols
  const used = parts.filter(p => p.kind === 'used')
  const colorOf = (p: Segment) =>
    p.name === 'Other' ? OTHER_COLOR : SEGMENT_COLORS[used.indexOf(p) % SEGMENT_COLORS.length]!
  const width = (t: number) => (W * Math.min(t, window)) / window
  let x = 0
  const fills = used.map(p => {
    const r = `<rect x="${x.toFixed(1)}" y="0" width="${width(p.tokens).toFixed(1)}" height="${barH}" fill="${colorOf(p)}"/>`
    x += width(p.tokens)
    return r
  })
  let end = W
  const hatched = parts
    .filter(p => p.kind === 'buffer')
    .map(p => {
      end -= width(p.tokens)
      return `<rect x="${end.toFixed(1)}" y="0" width="${width(p.tokens).toFixed(1)}" height="${barH}" fill="url(#hatch)"/>`
    })
  const items = parts.map((p, i) => {
    const lx = (i % cols) * colW
    const ly = barH + gap + Math.floor(i / cols) * row + 14
    const swatch =
      p.kind === 'used'
        ? `<rect x="${lx}" y="${ly - 10}" width="9" height="9" rx="2" fill="${colorOf(p)}"/>`
        : p.kind === 'buffer'
          ? `<rect x="${lx}" y="${ly - 10}" width="9" height="9" rx="2" fill="url(#hatch)"/>`
          : `<rect x="${lx + 0.5}" y="${ly - 9.5}" width="8" height="8" rx="2" fill="none" class="edge"/>`
    const figure = compact(p.tokens)
    const name = fit(p.name, colW - 28 - figure.length * 8, 14)
    return (
      swatch +
      `<text x="${lx + 16}" y="${ly}" font-size="14" class="${p.kind === 'used' ? 't' : 'm'}">${esc(name)}` +
      `<tspan class="m"> ${esc(figure)}</tspan></text>`
    )
  })
  const H = barH + gap + Math.ceil(parts.length / cols) * row
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<style>.t{fill:#1f2328}.m{fill:#59636e}.track{fill:#d1d9e0}.edge{stroke:#59636e}.hatch{fill:#8c959f}` +
    `@media (prefers-color-scheme: dark){.t{fill:#e6edf3}.m{fill:#9198a1}.track{fill:#3d444d}.edge{stroke:#9198a1}.hatch{fill:#6e7681}}` +
    `text{font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif}</style>` +
    `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">` +
    `<rect width="2" height="4" class="hatch"/></pattern>` +
    `<clipPath id="bar"><rect x="0" y="0" width="${W}" height="${barH}" rx="4"/></clipPath></defs>` +
    `<g clip-path="url(#bar)"><rect x="0" y="0" width="${W}" height="${barH}" class="track"/>${fills.join('')}${hatched.join('')}</g>` +
    items.join('') +
    `</svg>`
  )
}

// Cuts a line to fit its column, by an average glyph width for the font size
// (a UI sans at mixed case and digits runs near half the size per glyph).
export function fit(text: string, widthPx: number, fontSize: number): string {
  const max = Math.floor(widthPx / (fontSize * 0.5))
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
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
