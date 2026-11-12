// Pure logic for the warning signs a token count misses: repeated corrections,
// loops, a large context left idle past the prompt cache, and "done" said late
// in a long context. Sources are in docs/long-context-research.md.

import { compact } from './rules'

// ── corrections ───────────────────────────────────────────────────────────────

// A prompt that says the last answer was wrong. Laban et al. (2025): once a
// model takes a wrong turn in a conversation it "does not recover"; one fresh,
// consolidated prompt scores near a single-turn one. Anthropic's best practices
// draw the line at two failed corrections.
const CORRECTION_START =
  /^\s*(no\b(?![\s,]*(problem|worries|rush|need))|nope\b|wrong\b|incorrect\b|not quite\b|that'?s (not|wrong|still)|this is (not|still|wrong)|it'?s still\b|you (broke|missed|forgot|didn'?t)|revert\b|undo\b|try again\b)/i
const CORRECTION_ANYWHERE =
  /\b(still (broken|failing|fails|wrong|not working|the same|doesn'?t|isn'?t|happening)|(didn'?t|doesn'?t|does not|did not) work|not working|same (error|issue|problem|bug|failure)|that broke|you broke|made it worse)\b/i

export const isCorrection = (text: string) => {
  const t = text.trim()
  // A long prompt is a new brief, not a correction, whatever it opens with.
  if (t.length === 0 || t.length > 600 || t.startsWith('/')) return false
  return CORRECTION_START.test(t) || CORRECTION_ANYWHERE.test(t)
}

// Corrections in a row before the band speaks.
export const CORRECTIONS_LIMIT = 2

// ── loops ─────────────────────────────────────────────────────────────────────

// One finished tool call, as the loop check remembers it.
export type Call = {
  tool: string
  // What makes two calls the same call: the tool and its arguments.
  key: string
  isError: boolean
  // For an Edit: the file and the text it swapped, to spot an edit undone.
  edit?: { file: string; from: string; to: string }
}

const ARG_KEYS = ['command', 'file_path', 'path', 'pattern', 'old_string', 'new_string', 'url', 'query', 'prompt'] as const

// The call's arguments that name what it does, so repeated calls compare
// equal. Meta fields (ids, the agent) are left out.
export function callOf(tool: string, args: Record<string, unknown>, isError: boolean): Call {
  const parts = ARG_KEYS.filter(k => typeof args[k] === 'string').map(k => `${k}=${String(args[k]).slice(0, 400)}`)
  const call: Call = { tool, key: `${tool}|${parts.join('|')}`, isError }
  if (
    (tool === 'Edit' || tool === 'MultiEdit') &&
    typeof args.file_path === 'string' &&
    typeof args.old_string === 'string' &&
    typeof args.new_string === 'string'
  ) {
    call.edit = { file: args.file_path, from: args.old_string, to: args.new_string }
  }
  return call
}

// How many recent calls the check looks back over, and the repeats that count.
export const LOOP_WINDOW = 12
export const FAILED_REPEATS = 3

export type Loop = { kind: 'failing' | 'undo'; what: string; times: number }

const what = (c: Call) => {
  const arg = c.key.split('|')[1]?.replace(/^\w+=/, '') ?? ''
  const short = arg.length > 40 ? `${arg.slice(0, 39)}…` : arg
  return short ? `${c.tool} ${short}` : c.tool
}

// Breunig (2025): a poisoned or distracted context shows as the agent
// repeating itself. Two shapes are cheap to see: the same call failing again
// and again, and an edit that puts back what an earlier edit took out.
export function loopIn(calls: readonly Call[]): Loop | undefined {
  const recent = calls.slice(-LOOP_WINDOW)
  const last = recent[recent.length - 1]
  if (!last) return undefined
  if (last.isError) {
    const times = recent.filter(c => c.isError && c.key === last.key).length
    if (times >= FAILED_REPEATS) return { kind: 'failing', what: what(last), times }
  }
  if (last.edit) {
    const e = last.edit
    const undone = recent.slice(0, -1).filter(c => c.edit && c.edit.file === e.file && c.edit.from === e.to && c.edit.to === e.from)
    if (undone.length > 0) return { kind: 'undo', what: `Edit ${fileOnly(e.file)}`, times: undone.length + 1 }
  }
  return undefined
}

const fileOnly = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

// ── idle ──────────────────────────────────────────────────────────────────────

// Past the prompt cache's lifetime (`cacheTtl` in rules.ts), the next message
// re-reads the whole context uncached. Warn this long before it runs out.
export const IDLE_WARN_BEFORE_MS = 5 * 60_000
// A lifetime this short runs out in every pause; a warning each time is noise.
export const IDLE_WARN_MIN_TTL_MS = 15 * 60_000
// Below this a re-read is cheap: Anthropic's own idle compaction starts here.
export const IDLE_TOKENS = 200_000

export const idleWarning = (tokens: number) =>
  `${compact(tokens)} in context and idle: the prompt cache expires in about 5 minutes, and then the next message re-reads all of it. Hand off now, or /compact, if you are not coming straight back.`

// ── "done" late in a long context ─────────────────────────────────────────────

// Xue (2026): 38 of 44 failed coding-agent runs at long context still closed
// with an explicit claim of success. Only the closing lines count.
const DONE_CLAIM =
  /\b(?:all (?:tests|checks) pass(?:ed|ing)?|tests? pass(?:ed|ing)?|(?:is|are|now) (?:done|complete|fixed|working)|(?:fully |now )?implemented|completed successfully|works now|ready (?:to|for) (?:merge|review|ship))\b|\b(?:done|fixed)[.!]/i

export const claimsDone = (answer: string) => DONE_CLAIM.test(answer.slice(-600))

export const doneWarning = (tokens: number) =>
  `Claude says it is done, at ${compact(tokens)} of context. Long-context runs that failed usually said so too: check the diff and run the tests before you rely on it.`

// ── what the band shows ───────────────────────────────────────────────────────

export type SignalKind = 'corrections' | 'loop' | 'idle' | 'done'

export const signalText = {
  corrections: (n: number) => `${n} corrections in a row: consolidate into one prompt and hand off`,
  loop: (l: Loop) =>
    l.kind === 'failing'
      ? `${l.what} failed ${l.times}× in a row: step back or hand off`
      : `${l.what} undone and redone: step back or hand off`,
  idle: () => 'idle near cache expiry: hand off or /compact before you leave',
  done: () => 'says done late in a long context: verify it',
} as const
