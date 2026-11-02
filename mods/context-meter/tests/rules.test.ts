import { describe, expect, test } from 'claude-code/testing'

import {
  aliasFor,
  aliasOf,
  averageGrowth,
  fit,
  compact,
  compactInstructions,
  contextLevel,
  crossed,
  families,
  gauge,
  handoffPath,
  handoffPrompt,
  lastDelta,
  marks,
  modelName,
  parseAlias,
  readPrompt,
  resetIn,
  limitRow,
  signed,
  sparkline,
  stageOf,
  stripSvg,
  segments,
  breakdownSvg,
  turnsLeft,
  warning,
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

test('the strip is one thin SVG line: figures, bars and short resets', () => {
  const strip = {
    percent: 52,
    tokens: 104_000,
    window: 200_000,
    limits: [
      { name: '5h', percent: 31, reset: 'in 2h 10m' },
      { name: '7d<', percent: 80, reset: 'just now' },
    ],
  }
  const svg = stripSvg(strip)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('height="26"')
  expect(svg).toContain('>52%<')
  expect(svg).toContain('104k')
  // Short resets in the line; the full sentences live in Details.
  expect(svg).toContain('>2h 10m<')
  expect(svg).toContain('>reset<')
  expect(svg).toContain('7d&lt;')
  expect(svg).not.toContain('<title>')
  expect(svg).not.toContain('<circle')
  expect(svg.length).toBeLessThan(131072)
  // No limits: no hairline either.
  expect(stripSvg({ ...strip, limits: [] })).not.toContain('class="rule"')
})

test('the breakdown sums parts under 1% as Other and draws one stacked bar with a legend', () => {
  const cats = [
    { name: 'System tools', tokens: 36_000, color: 'inactive', kind: 'used' as const },
    { name: 'Messages', tokens: 94_000, color: 'permission', kind: 'used' as const },
    { name: 'Memory files', tokens: 2_000, color: 'claude', kind: 'used' as const },
    { name: 'Custom agents', tokens: 245, color: 'suggestion', kind: 'used' as const },
    { name: 'Free space', tokens: 774_000, color: 'inactive', kind: 'free' as const },
    { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', kind: 'buffer' as const },
  ]
  const parts = segments(cats, 1_000_000)
  expect(parts.map(p => `${p.name} ${p.tokens}`)).toEqual([
    'Messages 94000',
    'System tools 36000',
    'Other 2245',
    'Autocompact buffer 33000',
    'Free space 774000',
  ])
  const svg = breakdownSvg(parts, 1_000_000)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('Messages<tspan class="m"> 94k</tspan>')
  expect(svg).toContain('fill="url(#hatch)"')
  // Five parts, four to a row: two legend rows.
  expect(svg).toContain('height="64"')
  expect(svg).not.toContain('Custom agents')
})

test('fit cuts a line to its column by glyph width', () => {
  expect(fit('short', 200, 13)).toBe('short')
  expect(fit('5h limit 50% · resets in 3h 31m', 204, 12)).toBe('5h limit 50% · resets in 3h 31m')
  expect(fit('abcdefghijklmnopqrstuvwxyz', 65, 13)).toBe('abcdefghi…')
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
