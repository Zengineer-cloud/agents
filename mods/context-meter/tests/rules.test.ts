import { describe, expect, test } from 'claude-code/testing'

import {
  aliasFor,
  aliasOf,
  PALETTE,
  addCount,
  averageGrowth,
  barSvg,
  cacheCount,
  cacheLine,
  cacheShare,
  cacheStateText,
  cacheTtl,
  compact,
  compactInstructions,
  contextLevel,
  crossed,
  families,
  gauge,
  handoffPath,
  handoffPrompt,
  lastDelta,
  lifetimeText,
  marks,
  modelName,
  parseAlias,
  readPrompt,
  resetIn,
  limitRow,
  signed,
  sparkline,
  stageOf,
  segments,
  turnsLeft,
  warning,
  zoneGlyph,
  zoneName,
} from '../hooks/rules'

describe('model and effort', () => {
  const options = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'fable[1m]', 'opusplan']
  test('an alias splits into family and 1M window', () => {
    expect(parseAlias('opus[1m]')).toEqual({ family: 'opus', isLong: true })
    expect(parseAlias('haiku')).toEqual({ family: 'haiku', isLong: false })
  })
  test('the live model id reads back as an alias, 1M mark kept', () => {
    expect(aliasOf('claude-opus-5-5[1m]')).toBe('opus[1m]')
    expect(aliasOf('claude-haiku-4-5-20251001')).toBe('haiku')
    expect(aliasOf('opusplan')).toBeUndefined()
  })
  test('presets are not family buttons', () => {
    expect(families(options)).toEqual(['sonnet', 'opus', 'haiku', 'fable'])
  })
  test('the 1M window carries over only where the family has one', () => {
    expect(aliasFor('sonnet', true, options)).toBe('sonnet[1m]')
    expect(aliasFor('haiku', true, options)).toBe('haiku')
    expect(aliasFor('opus', false, options)).toBe('opus')
  })
  test('model ids read as names', () => {
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
    expect(modelName('opus[1m]')).toBe('Opus')
  })
})

test('a bar is an image with no text: a fill, an outlined track and ticks', () => {
  const svg = barSvg({ ratio: 0.52, tone: 'warn', width: 260, ticks: [0.35, 0.5] })
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('width="260" height="12"')
  // No text in the image: the figures are real text beside it.
  expect(svg).not.toContain('<text')
  expect(svg).not.toContain('<title>')
  expect(svg).toContain('class="warn"')
  expect(svg).toContain('class="track"')
  expect(svg.split('class="tick"').length - 1).toBe(2)
  // Both color schemes are in the image.
  expect(svg).toContain('prefers-color-scheme: dark')
  // Reserved space is hatched, free space an outline with no fill.
  expect(barSvg({ ratio: 0.2, tone: 'neutral', width: 240, style: 'hatched' })).toContain('fill="url(#hatch)"')
  expect(barSvg({ ratio: 0.7, tone: 'neutral', width: 240, style: 'hollow' })).not.toContain('class="neutral"')
  // An empty bar draws no fill; a sliver still shows.
  expect(barSvg({ ratio: 0, tone: 'ok', width: 64 })).not.toContain('class="ok"')
  expect(barSvg({ ratio: 0.001, tone: 'ok', width: 64 })).toContain('width="2.0"')
})

test('every bar color keeps 3:1 against light and dark app backgrounds (WCAG 1.4.11)', () => {
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const luminance = (hex: string) => {
    const [red, green, blue] = [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
  }
  const contrast = (x: string, y: string) => {
    const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p)
    return (hi! + 0.05) / (lo! + 0.05)
  }
  const backgrounds = {
    light: ['#ffffff', '#faf9f5', '#f0eee6'],
    dark: ['#0d1117', '#1f1e1d', '#262624', '#30302e'],
  }
  for (const scheme of ['light', 'dark'] as const)
    for (const color of Object.values(PALETTE[scheme]))
      for (const background of backgrounds[scheme]) expect(contrast(color, background)).toBeGreaterThanOrEqual(3)
})

test('each zone has its own shape, so it reads without color', () => {
  const shapes = (['sharp', 'quality fading', 'dumb zone'] as const).map(zoneGlyph)
  expect(new Set(shapes).size).toBe(3)
})

test('the breakdown sums parts under 1% as Other, then the buffer and the free space', () => {
  const cats = [
    { name: 'System tools', tokens: 36_000, color: 'inactive', kind: 'used' as const },
    { name: 'Messages', tokens: 94_000, color: 'permission', kind: 'used' as const },
    { name: 'Memory files', tokens: 2_000, color: 'claude', kind: 'used' as const },
    { name: 'Custom agents', tokens: 245, color: 'suggestion', kind: 'used' as const },
    { name: 'Free space', tokens: 774_000, color: 'inactive', kind: 'free' as const },
    { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', kind: 'buffer' as const },
  ]
  expect(segments(cats, 1_000_000).map(p => `${p.name} ${p.tokens}`)).toEqual([
    'Messages 94000',
    'System tools 36000',
    'Other 2245',
    'Autocompact buffer 33000',
    'Free space 774000',
  ])
})

describe('the prompt cache', () => {
  const request = { input_tokens: 9_000, output_tokens: 500, cache_read_input_tokens: 180_000, cache_creation_input_tokens: 3_000 }
  test('a request splits into read, written and new input', () => {
    expect(cacheCount(request)).toEqual({ read: 180_000, written: 3_000, fresh: 9_000 })
    expect(cacheShare(cacheCount(request))).toBe(94)
    expect(cacheLine(cacheCount(request))).toEqual({ lead: '94% from cache', rest: ' · 180k read · 3k written · 9k new' })
  })
  test('counts add up over turns, and no input gives no line', () => {
    const twice = addCount(cacheCount(request), cacheCount(request))
    expect(twice).toEqual({ read: 360_000, written: 6_000, fresh: 18_000 })
    expect(cacheLine({ read: 0, written: 0, fresh: 0 })).toBeUndefined()
  })
  test('the lifetime is an hour on a subscription seat, five minutes elsewhere, and the option wins', () => {
    expect(cacheTtl([{ kind: 'five_hour' }])).toEqual({ ms: 3_600_000, source: 'plan' })
    expect(cacheTtl([{ kind: 'spend_limit' }])).toEqual({ ms: 300_000, source: 'default' })
    expect(cacheTtl([])).toEqual({ ms: 300_000, source: 'default' })
    expect(cacheTtl([{ kind: 'five_hour' }], 5)).toEqual({ ms: 300_000, source: 'option' })
    // 0 means "read it off the plan".
    expect(cacheTtl([{ kind: 'seven_day' }], 0).source).toBe('plan')
    expect(lifetimeText(cacheTtl([{ kind: 'five_hour' }]))).toEqual({ lead: '1 hour', rest: ' · subscription plan' })
    expect(lifetimeText(cacheTtl([]))).toEqual({ lead: '5 minutes', rest: ' · API default' })
  })
  test('idle, the cache runs down from the last response, then the next message pays in full', () => {
    const ttl = cacheTtl([{ kind: 'five_hour' }])
    const at = 1_000_000_000
    expect(cacheStateText(ttl, undefined, at, 212_000, false).lead).toBe('no response yet')
    expect(cacheStateText(ttl, at, at + 8 * 60_000, 212_000, false)).toEqual({ lead: 'warm', rest: ' · about 52m left if idle' })
    expect(cacheStateText(ttl, at, at + 59.5 * 60_000, 212_000, false).rest).toBe(' · under a minute left if idle')
    expect(cacheStateText(ttl, at, at + 61 * 60_000, 212_000, false)).toEqual({
      lead: 'expired',
      rest: ' · the next message re-reads 212k at full price',
    })
    // While a turn runs, every request renews the entry.
    expect(cacheStateText(ttl, at, at + 61 * 60_000, 212_000, true).lead).toBe('warm')
  })
})

describe('marks', () => {
  test('a 1M window warns at 200k and hands off at 350k', () => {
    expect(marks(1_000_000)).toEqual({ fading: 200_000, dumb: 350_000 })
    expect(marks(1_000_000, 967_000).dumb).toBe(350_000)
  })
  test('a 200k window warns at a share of it instead', () => {
    expect(marks(200_000, 167_000)).toEqual({ fading: 70_000, dumb: 100_000 })
  })
  test('the handoff comes before an early autocompact', () => {
    expect(marks(1_000_000, 300_000)).toEqual({ fading: 200_000, dumb: 270_000 })
    expect(marks(1_000_000, 200_000)).toEqual({ fading: 180_000, dumb: 180_000 })
  })
  test('the zone follows tokens, not capacity', () => {
    const m = marks(1_000_000)
    expect([100_000, 200_000, 349_000, 350_000, 900_000].map(t => zoneName(t, m))).toEqual([
      'sharp',
      'quality fading',
      'quality fading',
      'dumb zone',
      'dumb zone',
    ])
    expect([100_000, 250_000, 400_000].map(t => contextLevel(t, m))).toEqual(['success', 'warning', 'error'])
    expect([100_000, 250_000, 400_000].map(t => stageOf(t, m))).toEqual([0, 1, 2])
  })
})

describe('handoff', () => {
  const now = Date.parse('2026-10-06T10:00:00Z')
  test('the doc lives in the repo, under a folder git ignores', () => {
    expect(handoffPath('Z:\\repo\\', 'abcdef1234567890', now)).toBe('Z:/repo/.claude/handoff/2026-10-06-1000-abcdef12.md')
  })
  test('each prompt names the doc', () => {
    const path = 'Z:/repo/.claude/handoff/x.md'
    expect(handoffPrompt(path, { tokens: 500_000, window: 1_000_000, percent: 50 })).toContain(`write a handoff doc to ${path}`)
    expect(handoffPrompt(path, { tokens: 500_000, window: 1_000_000, percent: 50 })).toContain('Next steps')
    expect(compactInstructions(path)).toContain(path)
    expect(readPrompt(path, 'cleared')).toContain(`just cleared for a handoff. Read the handoff doc at ${path}`)
    expect(readPrompt(path, 'compacted')).toContain('just compacted')
  })
})

describe('estimates', () => {
  test('a compaction shows as a drop', () => {
    expect(signed(lastDelta([180_000, 40_000])!)).toBe('−140k')
  })
  test('average growth skips compactions', () => {
    expect(averageGrowth([100, 110, 30, 50])).toBe(15)
    expect(averageGrowth([100])).toBeUndefined()
  })
  test('turns left counts whole turns to the limit', () => {
    expect(turnsLeft(100_000, 167_000, 6_000)).toBe(11)
    expect(turnsLeft(100_000, 167_000, undefined)).toBeUndefined()
  })
  test('a sliver of use still shows one cell', () => {
    expect(gauge(100, 200_000, 10)).toEqual({ filled: '█', empty: '░'.repeat(9) })
  })
  test('resets read as a countdown within a day', () => {
    const now = Date.parse('2026-10-06T10:00:00Z')
    expect(resetIn('2026-10-06T12:10:00Z', now)).toBe('in 2h 10m')
    expect(resetIn('2026-10-06T10:20:00Z', now)).toBe('in 20m')
  })
  test('a limit whose reset time has passed reads as a fresh window', () => {
    const now = Date.parse('2026-10-06T10:00:00Z')
    expect(limitRow({ kind: 'five_hour', percent: 60, resetsAt: '2026-10-06T09:59:00Z' }, now)).toEqual({
      name: '5h',
      percent: 0,
      reset: 'just now',
    })
    expect(limitRow({ kind: 'five_hour', percent: 60, resetsAt: '2026-10-06T10:20:00Z' }, now)).toEqual({
      name: '5h',
      percent: 60,
      reset: 'in 20m',
    })
    expect(limitRow({ kind: 'seven_day', percent: 57 }, now)).toEqual({ name: '7d', percent: 57, reset: undefined })
  })
})

describe('warnings', () => {
  test('each stage warns once: fading, then the dumb zone', () => {
    let s = crossed(0, 0)
    expect(s.level).toBeUndefined()
    s = crossed(1, s.warned)
    expect(s.level).toBe(1)
    s = crossed(1, s.warned)
    expect(s.level).toBeUndefined()
    s = crossed(2, s.warned)
    expect(s.level).toBe(2)
    expect(crossed(2, s.warned).level).toBeUndefined()
  })
  test('a drop after a compaction re-arms the stages', () => {
    let s = crossed(2, 0)
    s = crossed(0, s.warned)
    expect(s.warned).toBe(0)
    expect(crossed(1, s.warned).level).toBe(1)
  })
  test('each text names the step to take', () => {
    const m = marks(1_000_000)
    const r = (tokens: number) => ({ tokens, window: 1_000_000, percent: tokens / 10_000 })
    expect(warning(1, r(210_000), m)).toContain('Past 200k, answer quality tends to slip. The dumb zone starts at 350k; Handoff is yours to press.')
    expect(warning(2, r(360_000), m)).toContain('dumb zone')
    expect(warning(2, r(360_000), m)).toContain('Claude writes a state doc, the context is cleared')
  })
})

test('helpers', () => {
  expect(compact(950)).toBe('950')
  expect(compact(12_345)).toBe('12k')
  expect(sparkline([1, 8])).toBe('▁█')
})
