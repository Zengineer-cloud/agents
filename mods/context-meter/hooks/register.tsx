import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Category, Detail, Handoff, Meter, Setup } from '../types'
import {
  EFFORTS,
  HANDOFF_COMMAND,
  HANDOFF_DIR,
  aliasFor,
  aliasOf,
  averageGrowth,
  baseline,
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
  limitRow,
  forcedCompactAt,
  marks,
  parseAlias,
  readPrompt,
  signed,
  sparkline,
  stageOf,
  stripSvg,
  turnsLeft,
  warning,
  windowNote,
  zoneHint,
  zoneName,
} from './rules'

const meter = atom({ plugin: 'context-meter', key: 'meter' } as const, null as Meter | null)
const detail = atom({ plugin: 'context-meter', key: 'detail' } as const, null as Detail | null)
const setup = atom({ plugin: 'context-meter', key: 'setup' } as const, null as Setup | null)
const isOpen = atom({ plugin: 'context-meter', key: 'isOpen' } as const, false)
// The highest warning stage already shown; kept in state so a reload doesn't repeat a toast.
const warned = atom({ plugin: 'context-meter', key: 'warned' } as const, 0)
const handoff = atom({ plugin: 'context-meter', key: 'handoff' } as const, null as Handoff | null)

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
  const input = api ? api.input_tokens + api.cache_read_input_tokens + api.cache_creation_input_tokens : 0
  const categories: Category[] = b.categories
    .filter((c): c is typeof c & { kind: Category['kind'] } => c.kind !== 'deferred')
    .map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind }))
  await update($, detail, () => ({
    window: b.rawMaxTokens,
    windowSource: b.autocompactSource,
    categories,
    autoCompactAt: b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined,
    cacheHit: api && input > 0 ? Math.round((api.cache_read_input_tokens / input) * 100) : undefined,
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

// A read-back this chat still owes from a session that ended before it ran, if recent.
async function pendingReadBack($: EngineInterface): Promise<Pending | undefined> {
  if (pending === undefined) return undefined
  if ((await $.clock.now()) - pending.at > 30 * 60_000) {
    pending = undefined
    return undefined
  }
  return pending
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // A new process (a `/clear` raises no session.start): nothing is owed yet.
    pending = undefined
    lastClearAt = 0
    holdToasted = false
    holdsThisTurn = 0
    lastTurnFailed = false
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
    if (e.agentId === undefined) void quietly(refresh($, false))
    return result
  })

  // The person's own prompt while a handoff runs: the doc is already written, so
  // Claude adds what this exchange changes. In a session that `/clear` started
  // without finishing the read-back, the first prompt carries the read-back.
  on('prompt.submit', async ($, e, next) => {
    // Typed at the terminal, or sent by the Desktop app (`sdk`); never a plugin's own.
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'sdk') return next(e)
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
    if (
      e.trigger === 'auto' &&
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
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, meter)
    if (e.props.hasSurvey || m === null) return next(e)

    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // The terminal draws no images; every other surface takes the SVG card.
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined
    const open = await read($, isOpen)
    const d = await read($, detail)
    const s = await read($, setup)
    const now = await $.clock.now()
    const job = await read($, handoff)
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
    const fiveHour = m.limits.filter(l => l.kind === 'five_hour').map(l => limitRow(l, now))[0]
    const current = s?.alias ? parseAlias(s.alias) : undefined
    // The engine's own band (and any plugin's beneath) stays; this one goes under it.
    const below = await next(e)
    const effort = typeof s?.effort === 'string' ? s.effort : undefined

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
    // quiet before the zone, a button inside it.
    const handoffButton =
      !e.props.isWorking && (job === null || job.phase === 'queued') ? (
        <Button
          key="handoff"
          {...(isDumb ? {} : { plain: true as const, dimColor: true })}
          label={isDumb ? 'Handoff' : '⇥ Handoff'}
          onPress={() => quietly(beginHandoff($))}
        />
      ) : null

    // What the context is doing: a handoff's phase while one runs, else the
    // growth and the countdown. The window note rides along; it can wrap.
    const trend = status
      ? status
      : [delta !== undefined ? `${signed(delta)} last turn` : undefined, leftText, note].filter(Boolean).join(' · ')
    const zone = zoneName(m.tokens, mk)

    // Two quiet lines. Where the surface draws images: a thin strip of bars
    // (context, then each rate limit), and under it the zone and trend with
    // Handoff and Details at the right. In the terminal, one text row.
    const headline = Svg ? (
      <Box flexDirection="column">
        <Svg
          key="card"
          alt={`Context ${m.percent}% full, ${compact(m.tokens)} of ${compact(m.window)} tokens`}
          source={stripSvg({
            percent: m.percent,
            tokens: m.tokens,
            window: m.window,
            marks: mk,
            limits: m.limits.map(l => limitRow(l, now)),
          })}
        />
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={2}>
          <Text>
            <Text color={color}>{`● ${zone.charAt(0).toUpperCase()}${zone.slice(1)}`}</Text>
            <Text dimColor>{trend ? ` · ${trend}` : ''}</Text>
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
        <Text bold color={color}>
          {m.percent}%
        </Text>
        <Text color={color}>{zone}</Text>
        <Text dimColor>
          {compact(m.tokens)}/{compact(m.window)}
          {trend ? ` · ${trend}` : ''}
          {fiveHour ? ` · 5h ${Math.round(fiveHour.percent)}%` : ''}
        </Text>
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

    const options = s?.options ?? []
    const at = effort ? EFFORTS.indexOf(effort as (typeof EFFORTS)[number]) : -1
    const label = (text: string) => (
      <Box width={8}>
        <Text dimColor>{text}</Text>
      </Box>
    )
    // The session's settings, inside Details: a radio group for the model and a
    // stepped slider for effort. Plain Buttons draw as bare text, so the glyphs
    // carry the state.
    const controls = (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2} flexWrap="wrap" alignItems="center">
          {options.length ? label('Model') : null}
          {families(options).map(f => (
            <Button
              key={`model-${f}`}
              plain
              dimColor={current?.family !== f}
              label={`${current?.family === f ? '◉' : '○'} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
              // The 1M variant wherever a family has one; Haiku has none and stays 200k.
              onPress={() => runCommand($, 'model', aliasFor(f, true, options))}
            />
          ))}
        </Box>
        <Box flexDirection="row" alignItems="center" flexWrap="wrap">
          {label('Effort')}
          <Text dimColor>low </Text>
          {EFFORTS.map((choice, i) => (
            <Box key={`stop-${choice}`} flexDirection="row">
              {i > 0 ? <Text dimColor={i > at}>──</Text> : null}
              <Button
                key={`effort-${choice}`}
                plain
                dimColor={i > at}
                label={i === at ? '◉' : i < at ? '●' : '○'}
                onPress={() => runCommand($, 'effort', choice)}
              />
            </Box>
          ))}
          <Text dimColor> max</Text>
          <Text bold>{effort ? `  ${effort}` : ''}</Text>
        </Box>
      </Box>
    )

    const used =(d?.categories ?? []).filter(c => c.kind === 'used').sort((a, z) => z.tokens - a.tokens)
    const rest = (d?.categories ?? []).filter(c => c.kind !== 'used')

    const fixed = d ? baseline(d.categories) : 0
    return (
      <Box flexDirection="column">
        {below}
        {headline}
        {controls}
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          {d === null ? <Text dimColor>Counting…</Text> : null}
          {[...used, ...rest].map(c => {
            const g = gauge(c.tokens, m.window, wide ? 20 : 10)
            return (
              <Box key={`cat-${c.name}`} flexDirection="row" gap={1}>
                <Box width={22}>
                  <Text dimColor={c.kind !== 'used'} wrap="truncate">
                    {c.name}
                  </Text>
                </Box>
                <Box width={6} justifyContent="flex-end">
                  <Text>{compact(c.tokens)}</Text>
                </Box>
                <Text color={c.kind === 'used' ? c.color : undefined} dimColor={c.kind !== 'used'}>
                  {c.kind === 'free' ? '' : g.filled}
                </Text>
                <Text dimColor>{Math.round((c.tokens / m.window) * 100)}%</Text>
              </Box>
            )
          })}

          <Box flexDirection="row" marginTop={1}>
            {label('Zone')}
            <Text dimColor>{`${zone}: ${zoneHint(zone, mk)}`}</Text>
          </Box>
          <Box flexDirection="row">
            {label('Growth')}
            <Text dimColor>
              {m.history.length >= 2 ? `${sparkline(m.history.slice(-12))} ` : 'one turn so far'}
              {growth !== undefined ? ` avg ${signed(Math.round(growth))}/turn` : ''}
              {` · handoff at ${compact(mk.dumb)}`}
              {autoCompactAt ? ` · autocompact held until ${compact(forcedAt)}` : ' · autocompact off'}
            </Text>
          </Box>
          {m.limits.length ? (
            <Box flexDirection="row">
              {label('Limits')}
              <Text dimColor>
                {m.limits
                  .map(l => {
                    const r = limitRow(l, now)
                    const when = r.reset === 'just now' ? ' (reset just now)' : r.reset ? ` (resets ${r.reset})` : ''
                    return `${r.name} ${Math.round(r.percent)}%${when}`
                  })
                  .join(' · ')}
              </Text>
            </Box>
          ) : null}
          <Box flexDirection="row">
            {label('Session')}
            <Text dimColor>
              {m.usd !== undefined ? `$${m.usd.toFixed(2)}` : 'cost n/a'}
              {d?.cacheHit !== undefined ? ` · cache hit ${d.cacheHit}% on the last request` : ''}
              {d && d.mcpTokens > 0 ? ` · MCP tools ${compact(d.mcpTokens)}` : ''}
              {fixed > 0 ? ` · baseline ${compact(fixed)} on every turn (prompt, tools, memory)` : ''}
            </Text>
          </Box>
          {d && d.memoryFiles.length ? (
            <Box flexDirection="row">
              {label('Memory')}
              <Text dimColor wrap="truncate">
                {d.memoryFiles
                  .slice(0, 4)
                  .map(f => `${fileName(f.path)} ${compact(f.tokens)}`)
                  .join(' · ')}
              </Text>
            </Box>
          ) : null}
        </Box>
      </Box>
    )
  })
}
