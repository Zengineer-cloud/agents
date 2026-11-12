import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cache, Category, Detail, Handoff, Meter, Setup, Signal } from '../types'
import {
  EFFORTS,
  HANDOFF_COMMAND,
  HANDOFF_DIR,
  aliasFor,
  addCount,
  aliasOf,
  averageGrowth,
  barSvg,
  baseline,
  cacheCount,
  cacheLine,
  cacheStateText,
  cacheTtl,
  compact,
  compactInstructions,
  contextLevel,
  crossed,
  families,
  fileName,
  gauge,
  handoffPath,
  handoffPrompt,
  lastDelta,
  level,
  lifetimeText,
  limitRow,
  forcedCompactAt,
  marks,
  parseAlias,
  readPrompt,
  segments,
  signed,
  stageOf,
  toneOf,
  turnsLeft,
  warning,
  windowNote,
  zoneGlyph,
  zoneHint,
  zoneName,
} from './rules'
import {
  CORRECTIONS_LIMIT,
  IDLE_TOKENS,
  IDLE_WARN_BEFORE_MS,
  IDLE_WARN_MIN_TTL_MS,
  callOf,
  claimsDone,
  doneWarning,
  idleWarning,
  isCorrection,
  loopIn,
  signalText,
} from './signals'
import type { Call } from './signals'

const meter = atom({ plugin: 'context-meter', key: 'meter' } as const, null as Meter | null)
const detail = atom({ plugin: 'context-meter', key: 'detail' } as const, null as Detail | null)
const setup = atom({ plugin: 'context-meter', key: 'setup' } as const, null as Setup | null)
const isOpen = atom({ plugin: 'context-meter', key: 'isOpen' } as const, false)
// The highest warning stage already shown; kept in state so a reload doesn't repeat a toast.
const warned = atom({ plugin: 'context-meter', key: 'warned' } as const, 0)
const handoff = atom({ plugin: 'context-meter', key: 'handoff' } as const, null as Handoff | null)
// The warning sign the band shows until the next prompt (see signals.ts).
const signal = atom({ plugin: 'context-meter', key: 'signal' } as const, null as Signal | null)
// The prompt cache over this session's turns (see "the prompt cache" in rules.ts).
const cache = atom({ plugin: 'context-meter', key: 'cache' } as const, null as Cache | null)
// The `cacheTtlMinutes` option: 0 or absent reads the lifetime off the plan.
let ttlOption: number | undefined

const PHASE_TEXT: Record<Handoff['phase'], string> = {
  queued: 'handoff queued: it starts when this turn ends',
  writing: 'handoff 1/3: Claude writes the doc',
  clearing: 'handoff 2/3: clearing the context',
  reading: 'handoff 3/3: Claude reads the doc back',
}

// A handoff never runs on its own: the person presses Handoff or types
// `/handoff`. And it touches nothing outside its own chat: the state it needs
// across the `/clear` lives in this module, which the process keeps while the
// session id changes. `$.store` is one file shared by every open chat of every
// project, so nothing of the handoff goes there.
type Pending = { path: string; at: number }
// The read-back a `/clear` chain still owes, until it is sent or picked up.
let pending: Pending | undefined
// When this chat last cleared: a dumb-zone crossing soon after says the
// baseline itself is too large, which no handoff can fix.
let lastClearAt = 0
const SOON_AFTER_MS = 10 * 60_000

// Per turn: how often the engine's autocompact was held, and how the last turn
// ended. A second hold in one turn means the request itself is too long, and
// only a compaction gets the session out; so does a turn that ended in error.
let holdsThisTurn = 0
let lastTurnFailed = false
// The hold is announced once per context, not on every turn it repeats.
let holdToasted = false

// The warning signs' memory, per process: corrections in a row, the recent
// tool calls, when the last turn ended and whether one runs now, the idle
// timer, and whether "done" was already flagged in this context.
let corrections = 0
let calls: Call[] = []
let lastTurnEndAt = 0
let turnActive = false
let idleTimer: { cancel: () => void } | undefined
let doneFlagged = false
// Idle this long, an engine compaction is the cache-expiry one, not a full window.
const IDLE_COMPACT_MS = 5 * 60_000

// A fresh context (a handoff's clear, a compaction) starts the signs over.
function resetSignals() {
  corrections = 0
  calls = []
  doneFlagged = false
}

async function raise($: EngineInterface, next: Signal, toast?: string) {
  await update($, signal, () => next)
  if (toast) $.ui.toast(toast, { timeoutMs: 12000 })
}

// The free figures: fill, limits and cost. Cheap enough for every tool call.
// `tokensHint` stands in when the engine has no count yet (right after a compaction).
async function refresh($: EngineInterface, isTurnEnd: boolean, tokensHint?: number) {
  const usage = await $.session.usage()
  // Always the model's full window: the percent is a share of it, whatever
  // window the session happens to compact at.
  const { window } = usage.context
  if (!(window > 0)) return
  const tokens = usage.context.tokens ?? tokensHint
  const percent = tokens === undefined ? undefined : Math.round((tokens / window) * 100)
  await update($, meter, prev => {
    const history = [...(prev?.history ?? [])]
    if (isTurnEnd && tokens !== undefined) {
      history.push(tokens)
      if (history.length > 12) history.shift()
    }
    return {
      tokens: tokens ?? 0,
      window,
      percent: percent ?? 0,
      history,
      limits: usage.rateLimits.map(l => ({ kind: l.kind, percent: l.percentUsed, resetsAt: l.resetsAt })),
      usd: usage.cost?.usd,
    }
  })
  if (tokens === undefined || percent === undefined) return
  const m = marks(window, (await read($, detail))?.autoCompactAt)
  // Decided inside the update, so two refreshes in flight (parallel tool calls)
  // cannot both see the old value and both toast.
  let level: number | undefined
  await update($, warned, prev => {
    const alert = crossed(stageOf(tokens, m), prev)
    level = alert.level
    return alert.warned
  })
  if (level === undefined) return
  $.ui.toast(warning(level, { tokens, window, percent }, m), { timeoutMs: 12000 })
  if (level >= 2 && lastClearAt > 0 && (await $.clock.now()) - lastClearAt < SOON_AFTER_MS) {
    $.ui.toast(`Already past ${compact(m.dumb)} right after a handoff: the baseline is too large. Shrink the doc, memory files or MCP tools before the next one.`)
  }
}

// The /context breakdown, estimated locally (no token-count requests).
async function refreshDetail($: EngineInterface) {
  const b = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
  if (b === undefined) return
  const api = b.apiUsage
  const categories: Category[] = b.categories
    .filter((c): c is typeof c & { kind: Category['kind'] } => c.kind !== 'deferred')
    .map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind }))
  await update($, detail, () => ({
    window: b.rawMaxTokens,
    windowSource: b.autocompactSource,
    categories,
    autoCompactAt: b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined,
    lastRequest: api ? cacheCount(api) : undefined,
    memoryFiles: [...b.memoryFiles].sort((a, z) => z.tokens - a.tokens).map(f => ({ path: f.path, tokens: f.tokens })),
    mcpTokens: b.mcpTools.filter(t => t.isLoaded).reduce((n, t) => n + t.tokens, 0),
  }))
}

// The model buttons: choices from the `/config` model row, the current pick
// from the live session. The row holds the saved default, which a session-only
// `/model` leaves alone, so it is only the fallback.
async function refreshSetup($: EngineInterface) {
  const row = (await $.config.list()).find(r => r.key === 'model')
  if (!row) return
  const model = await $.session.model().catch(() => undefined)
  const alias = (model && aliasOf(model)) ?? (typeof row.value === 'string' ? row.value : undefined)
  await update($, setup, prev => ({ ...prev, alias, options: [...(row.options ?? [])], model: model ?? prev?.model }))
}

// Runs `/model`, `/effort` or `/compact` as if typed: queued until the session is
// idle, with its usual transcript lines. A refusal shows as a toast, never silence.
async function runCommand($: EngineInterface, command: 'model' | 'effort' | 'compact', args = ''): Promise<boolean> {
  try {
    await $.command.run({ command, args })
  } catch (err) {
    $.ui.toast(`/${command} did not run: ${message(err)}`)
    return false
  }
  await quietly(refreshSetup($))
  return true
}

const quietly = (p: Promise<unknown>) => p.catch(() => undefined)
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

// The handoff, step 1: ask for the doc, as a turn of its own once the session is idle.
async function beginHandoff($: EngineInterface) {
  const m = await read($, meter)
  const root = await $.session.root()
  const now = await $.clock.now()
  const path = handoffPath(root, await $.session.id(), now)
  // The folder ignores itself: handoff docs are working notes, never commits.
  await quietly($.fs.write(`${path.slice(0, path.lastIndexOf('/'))}/.gitignore`, '*\n'))
  await update($, handoff, () => ({ phase: 'writing' as const, path, since: now, waited: 0 }))
  const r = { tokens: m?.tokens ?? 0, window: m?.window ?? 0, percent: m?.percent ?? 0 }
  void $.prompt.submit({ text: handoffPrompt(path, r) }).catch(async err => {
    $.ui.toast(`The handoff did not start: ${message(err)}`)
    await update($, handoff, () => null)
  })
}

// Step 2, at the end of the doc's turn: a fresh context, then step 3. At the end
// of the read-back turn: done.
async function advanceHandoff($: EngineInterface, isAborted: boolean) {
  const job = await read($, handoff)
  if (job?.phase === 'reading') return void (await update($, handoff, () => null))
  if (job?.phase !== 'writing' || !job.path) return
  const path = job.path
  if (isAborted) {
    $.ui.toast(`The handoff stopped with the turn: the context was kept. Press Handoff to try again.`)
    return void (await update($, handoff, () => null))
  }
  const st = await $.fs.stat(path).catch(() => undefined)
  // Two seconds of slack between the engine's clock and the file system's.
  if (st?.kind === 'file' && st.mtimeMs >= (job.since ?? 0) - 2000) {
    await update($, handoff, () => ({ ...job, phase: 'clearing' as const }))
    // Not awaited: the commands wait for the idle session, which this hook holds.
    void quietly(resetContext($, path))
    return
  }
  // A prompt queued earlier may run first: wait one more turn, then give up.
  if ((job.waited ?? 0) < 1) return void (await update($, handoff, () => ({ ...job, waited: (job.waited ?? 0) + 1 })))
  $.ui.toast(`No handoff doc at ${path}, so the context was kept. Press Handoff to try again.`)
  await update($, handoff, () => null)
}

// Steps 2 and 3: `/clear` (or `/compact` with the doc named, where `/clear` is
// refused), then the read-back prompt. `/clear` starts a new session with empty
// state and no session.start, so the path rides this chain and the meter refills
// here. The module keeps the job too: should this chain die with the old session,
// the first prompt of the new one picks the read-back up (see prompt.submit).
async function resetContext($: EngineInterface, path: string) {
  const at = await $.clock.now()
  pending = { path, at }
  let how: 'cleared' | 'compacted' = 'cleared'
  try {
    await $.command.run({ command: 'clear', args: '' })
    lastClearAt = at
    holdToasted = false
    resetSignals()
  } catch {
    how = 'compacted'
    if (!(await runCommand($, 'compact', compactInstructions(path)))) {
      pending = undefined
      return void (await update($, handoff, () => null))
    }
  }
  await update($, handoff, () => ({ phase: 'reading' as const, path }))
  await quietly(refreshDetail($))
  await quietly(refresh($, false))
  await quietly(refreshSetup($))
  // The new session knows no slash commands of this plugin yet.
  await quietly($.command.register(HANDOFF_COMMAND))
  try {
    await $.prompt.submit({ text: readPrompt(path, how) })
    pending = undefined
  } catch (err) {
    $.ui.toast(`The read-back did not start: ${message(err)}. The doc is at ${path}.`)
    await update($, handoff, () => null)
  }
}

// The person's own prompt: it ends the last warning sign, and counts toward a
// run of corrections.
async function notePrompt($: EngineInterface, text: string) {
  corrections = isCorrection(text) ? corrections + 1 : 0
  if (corrections < CORRECTIONS_LIMIT) return void (await update($, signal, () => null))
  const toast =
    corrections === CORRECTIONS_LIMIT
      ? `${corrections} corrections in a row. Models that take a wrong turn rarely recover in the same conversation: ask Claude to consolidate what you've said into one prompt, then hand off.`
      : undefined
  await raise($, { kind: 'corrections', text: signalText.corrections(corrections) }, toast)
}

// The end of a main-loop turn: "done" said late in a long context gets one
// check-it note per context, and a large idle context a warning before the
// prompt cache expires.
async function noteTurnEnd($: EngineInterface, answer: string | undefined) {
  const m = await read($, meter)
  if (!m) return
  const mk = marks(m.window, (await read($, detail))?.autoCompactAt)
  if (answer !== undefined && !doneFlagged && m.tokens >= mk.dumb && claimsDone(answer)) {
    doneFlagged = true
    await raise($, { kind: 'done', text: signalText.done() }, doneWarning(m.tokens))
  }
  idleTimer?.cancel()
  idleTimer = undefined
  if (m.tokens < IDLE_TOKENS) return
  const ttl = cacheTtl(m.limits, ttlOption).ms
  if (ttl < IDLE_WARN_MIN_TTL_MS) return
  idleTimer = $.clock.after(ttl - IDLE_WARN_BEFORE_MS, () => {
    idleTimer = undefined
    void quietly(
      read($, meter).then(now => {
        if (turnActive || !now || now.tokens < IDLE_TOKENS) return
        return raise($, { kind: 'idle', text: signalText.idle() }, idleWarning(now.tokens))
      }),
    )
  })
}

// A read-back this chat still owes from a session that ended before it ran, if recent.
async function pendingReadBack($: EngineInterface): Promise<Pending | undefined> {
  if (pending === undefined) return undefined
  if ((await $.clock.now()) - pending.at > 30 * 60_000) {
    pending = undefined
    return undefined
  }
  return pending
}

export const register: Register = (on, options) => {
  ttlOption = typeof options.cacheTtlMinutes === 'number' ? options.cacheTtlMinutes : undefined
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // A new process (a `/clear` raises no session.start): nothing is owed yet.
    pending = undefined
    lastClearAt = 0
    holdToasted = false
    holdsThisTurn = 0
    lastTurnFailed = false
    resetSignals()
    turnActive = false
    lastTurnEndAt = 0
    idleTimer?.cancel()
    idleTimer = undefined
    await quietly($.command.register(HANDOFF_COMMAND))
    // The breakdown first: it says which window the meter measures against.
    await quietly(refreshDetail($))
    await quietly(refresh($, false))
    await quietly(refreshSetup($))
    return result
  })

  // `/handoff`: the Handoff button as a typed command, at any fill. A prompt
  // cannot be submitted from inside a command's own hook, so a timer does it next.
  on('command.run', { command: HANDOFF_COMMAND.name }, async ($) => {
    const job = await read($, handoff)
    if (job !== null && job.phase !== 'queued') return { text: `A handoff is already running (${PHASE_TEXT[job.phase]}).` }
    await update($, handoff, () => ({ phase: 'queued' as const }))
    $.clock.after(0, () => quietly(beginHandoff($)))
    return { text: 'Handoff: Claude writes the state doc, then the context is cleared and the doc read back.' }
  })

  // Each main-loop request carries the effort in use. Its model id may drop the
  // `[1m]` mark, so the model comes from `$.session.model()` instead.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      // A main-loop request: a turn runs, so the idle warning is moot.
      turnActive = true
      idleTimer?.cancel()
      idleTimer = undefined
      const { effort } = e
      void quietly(update($, setup, prev => (prev?.effort === effort ? prev : { options: [], ...prev, effort })))
    }
    return yield* next(e)
  })

  // Live during a turn: each finished main-loop tool call follows a fresh API
  // response. Subagents have their own context.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    // Not awaited, so the meter never holds up a tool result.
    if (e.agentId === undefined) {
      void quietly(refresh($, false))
      const isError = 'isError' in result && result.isError === true
      calls = [...calls, callOf(e.tool, e as unknown as Record<string, unknown>, isError)].slice(-24)
      const loop = loopIn(calls)
      if (loop) {
        const text = signalText.loop(loop)
        void quietly(
          read($, signal).then(cur =>
            cur?.text === text
              ? undefined
              : raise($, { kind: 'loop', text }, `${text}. A step that keeps failing or flipping is a common sign of a confused context.`),
          ),
        )
      }
    }
    return result
  })

  // The person's own prompt while a handoff runs: the doc is already written, so
  // Claude adds what this exchange changes. In a session that `/clear` started
  // without finishing the read-back, the first prompt carries the read-back.
  on('prompt.submit', async ($, e, next) => {
    // Typed at the terminal, or sent by the Desktop app (`sdk`); never a plugin's own.
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'sdk') return next(e)
    // A slash command or a hidden prompt is no correction. Older engines lack both fields.
    const flags = e as { command?: unknown; isMeta?: unknown }
    if (!flags.command && !flags.isMeta) await quietly(notePrompt($, e.text))
    const job = await read($, handoff)
    if (job?.path && (job.phase === 'writing' || job.phase === 'clearing')) {
      return next({
        ...e,
        context: [
          ...(e.context ?? []),
          `A handoff doc for this session was just written to ${job.path}, and the context is about to be cleared. After you answer, append a short note on this exchange to that doc so nothing is lost.`,
        ],
      })
    }
    const left = job === null ? await pendingReadBack($) : undefined
    if (left === undefined) return next(e)
    pending = undefined
    await update($, handoff, () => ({ phase: 'reading' as const, path: left.path }))
    return next({ ...e, context: [...(e.context ?? []), readPrompt(left.path, 'cleared')] })
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const job = await read($, handoff)
    const m = await read($, meter)
    // The engine's own compaction never runs on its own while there is room:
    // it is held, and the person hands off when ready. Near the hard limit it
    // runs; so does the second attempt in one turn, and the one after a failed
    // turn, because then the request itself is too long and no doc can help.
    // Idle, the engine compacts to spare a cache-expired re-read; that one runs.
    const isIdle = !turnActive && lastTurnEndAt > 0 && (await $.clock.now()) - lastTurnEndAt >= IDLE_COMPACT_MS
    if (
      e.trigger === 'auto' &&
      !isIdle &&
      job?.phase !== 'clearing' &&
      m &&
      m.tokens < forcedCompactAt(m.window) &&
      holdsThisTurn === 0 &&
      !lastTurnFailed
    ) {
      holdsThisTurn++
      if (!holdToasted) {
        holdToasted = true
        $.ui.toast(
          `Autocompact held at ${compact(m.tokens)}: press Handoff (or type /handoff) at a good stopping point. It runs on its own only past ${compact(forcedCompactAt(m.window))}.`,
          { timeoutMs: 12000 },
        )
      }
      return { skip: 'context-meter holds autocompact: the person hands off with a state doc when ready' }
    }
    const result = await next(e)
    // A compaction ends no turn: record its drop and redraw at once. The engine
    // has no count until the next response, so the compaction's own stands in.
    const after = result.skip === undefined ? result.tokensAfter : undefined
    if (result.skip === undefined) resetSignals()
    void quietly(refreshDetail($).then(() => refresh($, true, after)))
    return result
  })

  // The engine pushes a measurement when a rate-limit window moves a whole
  // point, so the limits refill after a reset without waiting for a tool call.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await quietly(refresh($, false))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // Subagents have their own context; only the main conversation counts here.
    if (e.agentId === undefined) {
      holdsThisTurn = 0
      lastTurnFailed = e.reason === 'error'
      await quietly(advanceHandoff($, e.isAborted || e.reason !== 'answer'))
      await quietly(refreshDetail($))
      await quietly(refresh($, true))
      if ((await read($, handoff))?.phase === 'queued') await quietly(beginHandoff($))
      void quietly(refreshSetup($))
      turnActive = false
      lastTurnEndAt = await $.clock.now()
      const spent = e.usage ? cacheCount(e.usage) : undefined
      await update($, cache, prev => ({
        session: spent ? addCount(prev?.session ?? { read: 0, written: 0, fresh: 0 }, spent) : (prev?.session ?? { read: 0, written: 0, fresh: 0 }),
        turns: (prev?.turns ?? 0) + (spent ? 1 : 0),
        lastResponseAt: spent ? lastTurnEndAt : prev?.lastResponseAt,
      }))
      await quietly(noteTurnEnd($, e.reason === 'answer' ? e.answer : undefined))
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, meter)
    if (e.props.hasSurvey || m === null) return next(e)

    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // The terminal draws no images; every other surface draws the bars as SVG.
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined
    const open = await read($, isOpen)
    const d = await read($, detail)
    const s = await read($, setup)
    const c = await read($, cache)
    const now = await $.clock.now()
    const job = await read($, handoff)
    // A warning sign outranks the trend, never a handoff in progress.
    const sign = job ? null : await read($, signal)
    const wide = e.props.bodyColumns >= 90
    const autoCompactAt = d?.autoCompactAt
    const mk = marks(m.window, autoCompactAt)
    const color = contextLevel(m.tokens, mk)
    const delta = lastDelta(m.history)
    const growth = averageGrowth(m.history)
    // Before the dumb zone, count down to it (the handoff). Inside it, to the
    // forced compact the band holds off until then, or to full with autocompact off.
    const isDumb = m.tokens >= mk.dumb
    const forcedAt = forcedCompactAt(m.window)
    const left = turnsLeft(m.tokens, isDumb ? (autoCompactAt ? forcedAt : m.window) : mk.dumb, growth)
    const leftText =
      left === undefined ? undefined : `≈${left} turns to ${isDumb ? (autoCompactAt ? 'a forced compact' : 'full') : 'the handoff'}`
    const status = job ? PHASE_TEXT[job.phase] : undefined
    const note = windowNote(d?.window, m.window)
    const limits = m.limits.map(l => limitRow(l, now))
    const fiveHour = m.limits.filter(l => l.kind === 'five_hour').map(l => limitRow(l, now))[0]
    const current = s?.alias ? parseAlias(s.alias) : undefined
    // The engine's own band (and any plugin's beneath) stays; this one goes under it.
    const below = await next(e)
    const effort = typeof s?.effort === 'string' ? s.effort : undefined
    const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

    // The band's hotkeys arm from the terminal's focus chord; a desktop clicks.
    const toggle = (
      <Button
        key="toggle"
        plain
        dimColor
        {...(Svg ? {} : { hotkey: 'd' })}
        label={Svg ? `${open ? '▾' : '▸'} Details` : `${open ? '▾' : '▸'} Context`}
        onPress={async () => {
          const opening = !(await read($, isOpen))
          await update($, isOpen, () => opening)
          if (opening) await quietly(refreshDetail($))
        }}
      />
    )

    // Doc, fresh context, read-back: the steps the meter runs on entering the
    // dumb zone. Offered at any fill, so a natural break can take it early;
    // quiet before the zone, a button inside it or while a warning sign shows.
    const isUrgent = isDumb || sign !== null
    const handoffButton =
      !e.props.isWorking && (job === null || job.phase === 'queued') ? (
        <Button
          key="handoff"
          {...(isUrgent ? {} : { plain: true as const, dimColor: true })}
          label={isUrgent ? 'Handoff' : '⇥ Handoff'}
          onPress={() => quietly(beginHandoff($))}
        />
      ) : null

    // What the context is doing: a handoff's phase while one runs, else the
    // growth and the countdown. The window note rides along; it can wrap.
    const trend = status
      ? status
      : [delta !== undefined ? `${signed(delta)} last turn` : undefined, leftText, note].filter(Boolean).join(' · ')
    const zone = zoneName(m.tokens, mk)
    // The zone as a colored shape and a plain word: the word carries the
    // meaning, so it keeps the text color's contrast in every theme.
    const glyph = <Text color={color}>{zoneGlyph(zone)}</Text>

    // Two quiet lines. Where the surface draws images: the figures as text with
    // a thin bar each (context, then each rate limit), and under them the zone
    // and trend with Handoff and Details at the right. In the terminal, one row.
    const headline = Svg ? (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" gap={2} flexWrap="wrap">
          <Text>
            <Text bold>{compact(m.tokens)}</Text>
            {` / ${compact(m.window)}`}
          </Text>
          <Svg
            key="card"
            alt={`Context ${m.percent}% full, ${compact(m.tokens)} of ${compact(m.window)} tokens`}
            source={barSvg({
              ratio: m.tokens / m.window,
              tone: toneOf(color),
              width: 260,
              ticks: [mk.fading / m.window, mk.dumb / m.window],
            })}
          />
          <Text bold>{`${m.percent}%`}</Text>
          {limits.slice(0, 2).map(l => (
            <Box key={`limit-${l.name}`} flexDirection="row" alignItems="center" gap={1}>
              <Text>{l.name}</Text>
              <Svg
                alt={`${l.name} limit ${Math.round(l.percent)}% used`}
                source={barSvg({ ratio: l.percent / 100, tone: toneOf(level(l.percent)), width: 64 })}
              />
              <Text>
                {`${Math.round(l.percent)}%`}
                <Text dimColor>{l.reset ? ` · ${l.reset === 'just now' ? 'reset' : l.reset.replace(/^in /, '')}` : ''}</Text>
              </Text>
            </Box>
          ))}
        </Box>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={2}>
          <Text>
            {glyph}
            {` ${cap(zone)}`}
            {sign ? (
              <Text>
                {' · '}
                <Text color="warning">⚠</Text>
                {` ${sign.text}`}
              </Text>
            ) : (
              <Text dimColor>{trend ? ` · ${trend}` : ''}</Text>
            )}
          </Text>
          <Box flexDirection="row" gap={2} alignItems="center">
            {handoffButton}
            {toggle}
          </Box>
        </Box>
      </Box>
    ) : (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {toggle}
        <Text>
          <Text color={color}>{gauge(m.tokens, m.window, wide ? 24 : 12).filled}</Text>
          <Text dimColor>{gauge(m.tokens, m.window, wide ? 24 : 12).empty}</Text>
        </Text>
        <Text bold>{m.percent}%</Text>
        {glyph}
        <Text>{zone}</Text>
        <Text dimColor>
          {compact(m.tokens)}/{compact(m.window)}
          {trend ? ` · ${trend}` : ''}
          {fiveHour ? ` · 5h ${Math.round(fiveHour.percent)}%` : ''}
        </Text>
        {sign ? (
          <Text>
            <Text color="warning">⚠</Text>
            {` ${sign.text}`}
          </Text>
        ) : null}
        {handoffButton}
      </Box>
    )

    if (!open) {
      return (
        <Box flexDirection="column">
          {below}
          {headline}
        </Box>
      )
    }

    // Details: titled sections of rows. A row is a label in a fixed column,
    // the figure that matters, then dim context. Nothing is cut: a long row wraps.
    const LABEL = 14
    const row = (name: string, lead: string, rest = '') => (
      <Box key={`row-${name}`} flexDirection="row" gap={1}>
        <Box width={LABEL}>
          <Text>{name}</Text>
        </Box>
        <Text>
          {lead}
          <Text dimColor>{rest}</Text>
        </Text>
      </Box>
    )
    const section = (title: string, rows: unknown[]) => (
      <Box key={`section-${title}`} flexDirection="column">
        <Text bold>{title}</Text>
        {rows}
      </Box>
    )

    const options = s?.options ?? []
    // The session's settings on one row, as words: the current pick is a
    // framed button, the rest bare and dim.
    const pick = (key: string, text: string, isOn: boolean, onPress: () => unknown) => (
      <Button key={key} {...(isOn ? {} : { plain: true as const, dimColor: true })} label={text} onPress={onPress} />
    )
    const controls = (
      <Box flexDirection="row" gap={3} flexWrap="wrap" alignItems="center">
        {options.length ? (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text>Model</Text>
            {families(options).map(f =>
              // The 1M variant wherever a family has one; Haiku has none and stays 200k.
              pick(`model-${f}`, cap(f), current?.family === f, () =>
                runCommand($, 'model', aliasFor(f, true, options)),
              ),
            )}
          </Box>
        ) : null}
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text>Effort</Text>
          {EFFORTS.map(choice => pick(`effort-${choice}`, choice, effort === choice, () => runCommand($, 'effort', choice)))}
        </Box>
      </Box>
    )

    // One row per part of the window: its name, tokens, share, and a bar whose
    // length is the share. Reserved space is hatched and free space an outline,
    // so no part is told apart by hue.
    const parts = d ? segments(d.categories, m.window) : []
    const breakdown =
      d === null
        ? [<Text key="counting">Counting…</Text>]
        : parts.map(p => {
            const share = Math.round((p.tokens / m.window) * 100)
            return (
              <Box key={`cat-${p.name}`} flexDirection="row" gap={1} alignItems="center">
                <Box width={22}>
                  <Text>{p.name}</Text>
                </Box>
                <Box width={6} justifyContent="flex-end">
                  <Text>{compact(p.tokens)}</Text>
                </Box>
                <Box width={5} justifyContent="flex-end">
                  <Text>{`${share}%`}</Text>
                </Box>
                {Svg ? (
                  <Svg
                    alt={`${p.name} ${share}%`}
                    source={barSvg({
                      ratio: p.tokens / m.window,
                      tone: 'neutral',
                      width: 240,
                      style: p.kind === 'used' ? 'solid' : p.kind === 'buffer' ? 'hatched' : 'hollow',
                    })}
                  />
                ) : (
                  <Text dimColor={p.kind !== 'used'}>
                    {p.kind === 'free' ? '' : gauge(p.tokens, m.window, wide ? 20 : 10).filled}
                  </Text>
                )}
              </Box>
            )
          })

    const fixed = d ? baseline(d.categories) : 0
    const memory = d?.memoryFiles ?? []
    const ttl = cacheTtl(m.limits, ttlOption)
    const lastRequest = d?.lastRequest ? cacheLine(d.lastRequest) : undefined
    const sessionCache = c && c.turns > 0 ? cacheLine(c.session) : undefined
    const life = lifetimeText(ttl)
    const state = cacheStateText(ttl, c?.lastResponseAt, now, m.tokens, e.props.isWorking)
    return (
      <Box flexDirection="column">
        {below}
        {headline}
        <Box flexDirection="column" marginTop={1} gap={1}>
          {controls}
          {section('Context', [
            row('Zone', cap(zone), ` · ${zoneHint(zone, mk)}`),
            row(
              'Growth',
              growth !== undefined ? `avg ${signed(Math.round(growth))}/turn` : 'one turn so far',
              ` · handoff at ${compact(mk.dumb)}${autoCompactAt ? ` · autocompact held until ${compact(forcedAt)}` : ' · autocompact off'}`,
            ),
            fixed > 0
              ? row(
                  'Baseline',
                  compact(fixed),
                  ` on every turn${d && d.mcpTokens > 0 ? `, MCP tools ${compact(d.mcpTokens)} of it` : ''}`,
                )
              : null,
            ...breakdown,
            memory.length
              ? row(
                  'Memory',
                  memory
                    .slice(0, 3)
                    .map(f => `${fileName(f.path)} ${compact(f.tokens)}`)
                    .join(' · '),
                  memory.length > 3 ? ` · +${memory.length - 3} more` : '',
                )
              : null,
          ])}
          {section('Cache', [
            lastRequest ? row('Last request', lastRequest.lead, lastRequest.rest) : null,
            sessionCache ? row('This session', sessionCache.lead, sessionCache.rest) : null,
            row('Lifetime', life.lead, life.rest),
            row('State', cap(state.lead), state.rest),
          ])}
          {limits.length
            ? section(
                'Limits',
                limits.map(l =>
                  row(
                    l.name,
                    `${Math.round(l.percent)}%`,
                    l.reset ? ` · ${l.reset === 'just now' ? 'reset just now' : `resets ${l.reset}`}` : '',
                  ),
                ),
              )
            : null}
          {section('Session', [
            m.usd !== undefined ? row('Cost', `$${m.usd.toFixed(2)}`) : null,
            row(
              'Signals',
              sign ? sign.text : 'none',
              sign ? '' : ` · watching corrections in a row, repeated failing calls, an idle cache, and "done" past ${compact(mk.dumb)}`,
            ),
          ])}
        </Box>
      </Box>
    )
  })
}
