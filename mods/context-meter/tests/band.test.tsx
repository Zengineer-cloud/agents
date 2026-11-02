import type { ConfigRow, On, RenderPropsOf, SessionContextBreakdown, SessionUsage, SessionUsageArgs } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const breakdown = {
  categories: [
    { name: 'Messages', tokens: 100_000, color: 'purple', isDeferred: false, kind: 'used' },
    { name: 'System tools', tokens: 20_000, color: 'gray', isDeferred: false, kind: 'used' },
    { name: 'MCP tools (deferred)', tokens: 9_000, color: 'gray', isDeferred: true, kind: 'deferred' },
    { name: 'Free space', tokens: 47_000, color: 'gray', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33_000, color: 'gray', isDeferred: false, kind: 'buffer' },
  ],
  isAutoCompactEnabled: true,
  autoCompactThreshold: 167_000,
  apiUsage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
  memoryFiles: [{ path: 'C:\\Users\\zenn\\.claude\\CLAUDE.md', type: 'User', tokens: 1200 }],
  mcpTools: [],
} as unknown as SessionContextBreakdown

// A 200k window: the marks are 70k (fading) and 100k (dumb zone, where the Handoff button turns solid).
// `compactAt` stands for `autoCompactWindow`: the window the breakdown measures against.
const usage = (percent: number, args?: SessionUsageArgs, compactAt = 200_000): SessionUsage => ({
  startedAt: 0,
  context: {
    tokens: percent * 2000,
    window: 200_000,
    percent,
    ...(args?.breakdown ? { breakdown: { ...breakdown, rawMaxTokens: compactAt } } : {}),
  },
  rateLimits: [{ kind: 'five_hour', percentUsed: 31 }],
  cost: { usd: 1.84 },
})

const MODEL_ROW = {
  key: 'model',
  label: 'Model',
  kind: 'choice',
  value: 'opus[1m]',
  options: ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'fable[1m]', 'opusplan'],
  provider: { plugin: 'engine', tier: 'core' },
  isLocked: false,
} as unknown as ConfigRow

const props = (isWorking = false): RenderPropsOf['AbovePrompt'] => ({
  hasSurvey: false,
  isWorking,
  maxRows: 30,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 29 },
  view: {},
})

const NOW = Date.parse('2026-10-06T10:00:00Z')
const DOC = 'Z:/repo/.claude/handoff/2026-10-06-1000-abcdef12.md'
// A compaction leaves at least one message: the summary.
const SUMMARY = [{ role: 'user' as const, text: 'Summary of the conversation so far.', toolUses: [] }]

// Stands in for the engine's own (empty) band.
const engineBand = (on: On) =>
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

// Answers what the band reads beneath it; records the slash commands it ran,
// the prompts it submitted, the files it wrote and the compactions that ran.
const answer = (on: On, percent: number, compactAt?: number) => {
  const seen = {
    runs: [] as string[],
    prompts: [] as string[],
    writes: [] as string[],
    compactions: [] as string[],
    toasts: [] as string[],
    // Files the model wrote with its own tools.
    docs: [] as string[],
    isBusy: false,
    // Commands the session refuses.
    refused: [] as string[],
    // The read-back prompt fails once: the chain dies with the old session.
    failReadBack: false,
    // The fill the session reports; a test moves it.
    percent,
    // The plugin's store, which outlives a session and is shared by every session.
    store: new Map<string, unknown>(),
  }
  on('session.usage', (_$, args) => ({ value: usage(seen.percent, args, compactAt) }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('config.list', () => ({ value: [MODEL_ROW] }))
  const { store } = seen
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('command.run', async ($, e) => {
    if (seen.isBusy || seen.refused.includes(e.command)) throw new Error('busy')
    seen.runs.push(`/${e.command} ${e.args}`)
    // A real `/clear` starts a new session whose atoms read as never written.
    // The test engine has no `state` noun, so that loss is not simulated here;
    // the store fallback test below covers the chain dying with the old session.
    return { text: '' }
  })
  on('clock.now', () => ({ value: NOW }))
  on('ui.toast', (_$, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('clock.after', () => ({ value: undefined }))
  on('session.root', () => ({ value: 'Z:\\repo' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.write', (_$, e) => {
    seen.writes.push(e.path)
    return { value: undefined }
  })
  on('fs.stat', (_$, e) => {
    if (!seen.docs.includes(e.path.replace(/\\/g, '/'))) throw new Error('ENOENT')
    return { value: { kind: 'file', size: 900, mtimeMs: NOW, isLink: false } }
  })
  on('prompt.submit', (_$, e) => {
    if (seen.failReadBack && e.text.includes('Read the handoff doc')) {
      seen.failReadBack = false
      throw new Error('session gone')
    }
    seen.prompts.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.compact', (_$, e) => {
    seen.compactions.push(e.trigger)
    return { messages: SUMMARY }
  })
  engineBand(on)
  return seen
}

// A prompt the person sends from the Desktop app.
const typed = ($: Engine, text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'sdk' } })

// A main-loop turn ending.
const turnEnds = ($: Engine, reason: 'answer' | 'aborted' | 'error' = 'answer') =>
  $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 1, isAborted: reason === 'aborted', reason })

// Lets the steps the hooks leave running (not awaited) finish.
// The kit's types leave out timers, but the test runtime has them.
const tick = (globalThis as unknown as { setTimeout: (fn: () => void, ms: number) => unknown }).setTimeout
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise<void>(resolve => tick(resolve, 0))
}

const BAND = { plugin: 'context-meter', component: 'AbovePrompt' } as const

test('desktop draws a thin strip and one zone line, the terminal a text row with the same figures', async ($, on) => {
  answer(on, 60)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })

  const desk = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  const card = await desk.find({ type: 'Svg' })
  expect(card?.props.alt).toBe('Context 60% full, 120k of 200k tokens')
  // An image, not a frame: a frame takes a default height far taller than the strip.
  expect(card?.props.isInteractive).toBeUndefined()
  // 120k: past the 100k dumb-zone mark. The zone is a text line; its meaning waits in Details.
  expect(await desk.find({ type: 'Text', text: /Dumb zone/ })).toBeDefined()
  expect(String(card?.props.source)).not.toContain('Opus')
  // The model and effort wait in Details; Handoff stays on the band.
  expect(await desk.find({ key: 'model-opus' })).toBeUndefined()
  expect(await desk.find({ key: 'effort-high' })).toBeUndefined()
  expect(await desk.find({ type: 'Text', text: /past 100k: handoff, then a fresh context/ })).toBeUndefined()
  expect(await desk.find({ key: 'handoff' })).toBeDefined()
  await desk.press({ key: 'toggle' })
  expect(await desk.find({ key: 'model-opus' })).toBeDefined()
  expect(await desk.find({ type: 'Text', text: /^Dumb zone · past 100k: handoff, then a fresh context$/ })).toBeDefined()
  await desk.press({ key: 'toggle' })
  await desk.unmount()

  const term = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  expect(await term.find({ type: 'Text', text: /^60%$/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /^dumb zone$/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /5h 31%/ })).toBeDefined()
  await term.unmount()
})

test('the zones follow tokens: 70k on a 200k window is already fading', async ($, on) => {
  answer(on, 35)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const term = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  expect(await term.find({ type: 'Text', text: /^quality fading$/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /turns to the dumb zone|70k\/200k/ })).toBeDefined()
  await term.unmount()
})

test('fill counts the full model window, and the card never promises an autocompact the band holds', async ($, on) => {
  // 80k tokens: 40% of the model's 200k, with a leftover 100k autoCompactWindow.
  answer(on, 40, 100_000)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const desk = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  const card = await desk.find({ type: 'Svg' })
  expect(card?.props.alt).toBe('Context 40% full, 80k of 200k tokens')
  expect(String(card?.props.source)).not.toContain('autocompact')
  await desk.unmount()
  const term = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  expect(await term.find({ type: 'Text', text: /^40%$/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /80k\/200k/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /autocompact/ })).toBeUndefined()
  await term.unmount()
})

test('model buttons pick the 1M variant wherever a family has one', async ($, on) => {
  const { runs } = answer(on, 40)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    runs.length = 0
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    await ui.press({ key: 'toggle' })
    // Words, not radio glyphs: the current pick is a framed button, the rest bare.
    const opus = await ui.find({ key: 'model-opus' })
    const sonnet = await ui.find({ key: 'model-sonnet' })
    expect(opus?.props.label).toBe('Opus')
    expect(opus?.props.plain).toBeUndefined()
    expect(sonnet?.props.label).toBe('Sonnet')
    expect(sonnet?.props.plain).toBe(true)
    expect(await ui.find({ key: 'model-1m' })).toBeUndefined()
    expect(await ui.find({ key: 'model-default' })).toBeUndefined()
    expect(await ui.find({ key: 'model-opusplan' })).toBeUndefined()
    await ui.press({ key: 'model-sonnet' })
    await ui.press({ key: 'model-haiku' })
    await ui.press({ key: 'model-fable' })
    expect(runs).toEqual(['/model sonnet[1m]', '/model haiku', '/model fable[1m]'])
    await ui.press({ key: 'toggle' })
    await ui.unmount()
  }
})

test('effort buttons run /effort', async ($, on) => {
  const { runs } = answer(on, 40)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'toggle' })
  await ui.press({ key: 'effort-high' })
  await ui.press({ key: 'effort-max' })
  expect(runs).toEqual(['/effort high', '/effort max'])
  await ui.unmount()
})

test('Handoff: Claude writes the doc, the context is cleared, then Claude reads the doc back', async ($, on) => {
  const seen = answer(on, 60)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })

  await ui.press({ key: 'handoff' })
  await settle()
  expect(seen.prompts[0]).toContain(`write a handoff doc to ${DOC}`)
  expect(seen.writes.map(p => p.replace(/\\/g, '/'))).toContain('Z:/repo/.claude/handoff/.gitignore')
  expect(seen.runs).toEqual([])

  // Claude's turn: it writes the doc.
  seen.docs.push(DOC)
  await turnEnds($)
  await settle()
  expect(seen.runs).toEqual(['/clear '])
  expect(seen.prompts[1]).toContain(`just cleared for a handoff. Read the handoff doc at ${DOC}`)
  // The new session's state was empty; the chain refilled it.
  expect(await ui.find({ type: 'Text', text: /handoff 3\/3/ })).toBeDefined()

  // The read-back turn ends the handoff.
  seen.percent = 10
  await turnEnds($)
  await settle()
  expect(await ui.find({ type: 'Text', text: /handoff \d\/3/ })).toBeUndefined()

  // Back past the mark minutes after the clear: a toast about the baseline, no new handoff.
  seen.percent = 60
  await turnEnds($)
  await settle()
  expect(seen.toasts.some(t => t.includes('baseline is too large'))).toBe(true)
  expect(seen.prompts.length).toBe(2)
  expect(seen.runs).toEqual(['/clear '])
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  await ui.unmount()
})

test('a read-back the old session could not send rides on the first prompt of the new one', async ($, on) => {
  const seen = answer(on, 60)
  seen.failReadBack = true
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'handoff' })
  seen.docs.push(DOC)
  await turnEnds($)
  await settle()
  expect(seen.runs).toEqual(['/clear '])
  expect(seen.prompts.length).toBe(1)
  expect(seen.toasts.some(t => t.startsWith('The read-back did not start'))).toBe(true)

  const first = await typed($, 'where were we?')
  expect(first.drop).toBeUndefined()
  expect((first.context ?? []).join('\n')).toContain(`Read the handoff doc at ${DOC}`)
  // Once only.
  const again = await typed($, 'and now?')
  expect((again.context ?? []).join('\n')).not.toContain('Read the handoff doc')
  await ui.unmount()
})

test('a handoff leaves nothing in the shared store, so no other chat can see it', async ($, on) => {
  const seen = answer(on, 60)
  seen.failReadBack = true
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'handoff' })
  seen.docs.push(DOC)
  await turnEnds($)
  await settle()
  expect(seen.runs).toEqual(['/clear '])
  // The store is one file for every open chat of every project: even with a
  // read-back still owed, the job stays in this chat's own process.
  expect([...seen.store.keys()]).toEqual([])
  await ui.unmount()
})

test('a prompt typed while the doc is written tells Claude to add to the doc', async ($, on) => {
  const seen = answer(on, 60)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'handoff' })
  await settle()
  const mid = await typed($, 'one more thing')
  expect((mid.context ?? []).join('\n')).toContain(`append a short note on this exchange to that doc`)
  expect(seen.prompts.at(-1)).toBe('one more thing')
  await ui.unmount()
})

test('a doc turn the user stopped keeps the context', async ($, on) => {
  const seen = answer(on, 60)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'handoff' })
  seen.docs.push(DOC)
  await turnEnds($, 'aborted')
  await settle()
  expect(seen.runs).toEqual([])
  expect(seen.toasts.some(t => t.startsWith('The handoff stopped with the turn'))).toBe(true)
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  await ui.unmount()
})

test('where /clear is refused, the handoff compacts with the doc named', async ($, on) => {
  const seen = answer(on, 60)
  seen.refused.push('clear')
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'handoff' })
  seen.docs.push(DOC)
  await turnEnds($)
  await settle()
  expect(seen.runs.length).toBe(1)
  expect(seen.runs[0]).toContain(`/compact A handoff doc for this session is at ${DOC}`)
  expect(seen.prompts[1]).toContain('just compacted for a handoff')
  await ui.unmount()
})

test('without a doc after two turns, nothing compacts and a toast says so', async ($, on) => {
  const seen = answer(on, 60)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'handoff' })
  await turnEnds($)
  await turnEnds($)
  await settle()
  expect(seen.runs).toEqual([])
  expect(seen.toasts.some(t => t.startsWith('No handoff doc at'))).toBe(true)
  await ui.unmount()
})

test("the engine's own compaction is held while there is room, and nothing runs on its own", async ($, on) => {
  const seen = answer(on, 60)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const held = await $.session.compact({ trigger: 'auto', messages: SUMMARY })
  expect(held.skip).toContain('holds autocompact')
  expect(seen.compactions).toEqual([])
  expect(seen.toasts.filter(t => t.startsWith('Autocompact held')).length).toBe(1)
  // No handoff starts when the turn ends: the person starts it.
  await turnEnds($)
  await settle()
  expect(seen.prompts).toEqual([])
  expect(seen.runs).toEqual([])
  // The next turn's hold is quiet: announced once per context.
  await $.session.compact({ trigger: 'auto', messages: SUMMARY })
  expect(seen.toasts.filter(t => t.startsWith('Autocompact held')).length).toBe(1)
})

test("a second autocompact in one turn, or one after a failed turn, runs: the request itself is too long", async ($, on) => {
  const seen = answer(on, 60)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  expect((await $.session.compact({ trigger: 'auto', messages: SUMMARY })).skip).toBeDefined()
  expect((await $.session.compact({ trigger: 'auto', messages: SUMMARY })).skip).toBeUndefined()
  expect(seen.compactions).toEqual(['auto'])
  await turnEnds($, 'error')
  await settle()
  expect((await $.session.compact({ trigger: 'auto', messages: SUMMARY })).skip).toBeUndefined()
  await turnEnds($)
  await settle()
  expect((await $.session.compact({ trigger: 'auto', messages: SUMMARY })).skip).toBeDefined()
})

test('a window of 0 draws nothing', async ($, on) => {
  on('session.usage', () => ({ value: { ...usage(0), context: { tokens: 0, window: 0, percent: 0 } } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('config.list', () => ({ value: [MODEL_ROW] }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  engineBand(on)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test("near the hard limit the engine's compaction runs", async ($, on) => {
  const seen = answer(on, 95)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ran = await $.session.compact({ trigger: 'auto', messages: SUMMARY })
  expect(ran.skip).toBeUndefined()
  expect(seen.compactions).toEqual(['auto'])
})

test('entering the dumb zone warns and offers the button; the handoff never starts by itself', async ($, on) => {
  const seen = answer(on, 60)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  expect(seen.toasts.some(t => t.includes('Press Handoff (or type /handoff)'))).toBe(true)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).not.toContain('handoff queued')
  // A solid button now, not the quiet one.
  expect((await ui.find({ key: 'handoff' }))?.props.plain).toBeUndefined()
  await ui.unmount()
  await turnEnds($)
  await turnEnds($)
  await settle()
  expect(seen.prompts).toEqual([])
  expect(seen.runs).toEqual([])
})

test('a refused command shows a toast instead of failing silently', async ($, on) => {
  const seen = answer(on, 40)
  seen.isBusy = true
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  await ui.press({ key: 'toggle' })
  await ui.press({ key: 'effort-high' })
  expect(seen.toasts.some(t => t.startsWith('/effort did not run'))).toBe(true)
  await ui.unmount()
})

test('before the dumb zone the Handoff button is quiet; while a turn runs there is none', async ($, on) => {
  answer(on, 45)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const idle = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect((await idle.find({ key: 'handoff' }))?.props.plain).toBe(true)
  await idle.unmount()
  const busy = await $.ui.mount({ ...BAND, surface: 'desktop', props: props(true) })
  expect(await busy.find({ key: 'handoff' })).toBeUndefined()
  await busy.unmount()
})

test('/handoff runs the same steps as the button, at any fill', async ($, on) => {
  const seen = answer(on, 20)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const first = await $.command.run({ command: 'handoff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(first.text).toContain('Claude writes the state doc')
  await settle()
  expect(seen.toasts).toEqual([])
  expect(seen.prompts[0]).toContain('write a handoff doc')
  const again = await $.command.run({ command: 'handoff', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(again.text).toContain('already running')
  expect(seen.prompts.length).toBe(1)
})

test('a session that loaded a smaller window says so, and Details shows the fixed baseline', async ($, on) => {
  // 80k tokens: 40% of the model's 200k, with a leftover 100k autoCompactWindow.
  answer(on, 40, 100_000)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  const desk = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  // The note is a text row under the card, never inside it: the card's columns stay clean.
  expect(String((await desk.find({ type: 'Svg' }))?.props.source)).not.toContain('100k window')
  expect(await desk.find({ type: 'Text', text: /loaded a 100k window from an old setting.*a new chat gets the full 200k/ })).toBeDefined()
  await desk.press({ key: 'toggle' })
  // System tools 20k; Messages are not baseline.
  expect(await desk.find({ type: 'Text', text: /^Baseline$/ })).toBeDefined()
  expect(await desk.find({ type: 'Text', text: /^20k on every turn$/ })).toBeDefined()
  await desk.unmount()
  const term = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  expect(await term.find({ type: 'Text', text: /loaded a 100k window/ })).toBeDefined()
  await term.unmount()
})

test('the toggle opens the breakdown, limits, cost and memory files, and closes it again', async ($, on) => {
  answer(on, 60)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: props() })
    // The breakdown: an image on the desktop, a row per part in the terminal.
    const parts = async () =>
      surface === 'desktop'
        ? (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt)).join(' ')
        : [
            (await ui.find({ type: 'Text', text: /^Messages$/ })) ? 'Messages' : '',
            (await ui.find({ type: 'Text', text: /^Autocompact buffer$/ })) ? 'Autocompact buffer' : '',
          ].join(' ')
    expect(await parts()).not.toContain('Messages')
    await ui.press({ key: 'toggle' })
    expect(await parts()).toContain('Messages')
    expect(await parts()).toContain('Autocompact buffer')
    expect(await parts()).not.toContain('deferred')
    expect(await ui.find({ type: 'Text', text: /deferred/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^\$1\.84 · cache hit 90%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\.claude\/CLAUDE\.md 1k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /handoff at 100k · autocompact held until 175k/ })).toBeDefined()
    await ui.press({ key: 'toggle' })
    expect(await parts()).not.toContain('Messages')
    await ui.unmount()
  }
})

test('the band draws nothing before the first reading', async ($, on) => {
  engineBand(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ key: 'toggle' })).toBeUndefined()
  await ui.unmount()
})
