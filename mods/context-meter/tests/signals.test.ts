import { describe, expect, test } from 'claude-code/testing'

import { callOf, claimsDone, isCorrection, loopIn } from '../hooks/signals'

describe('corrections', () => {
  test('a prompt that says the last answer was wrong counts', () => {
    for (const t of [
      'no, that is the wrong file',
      'Nope',
      "that's still broken",
      'it still fails with the same error',
      "the build didn't work",
      'You broke the header',
      'revert that',
    ])
      expect(isCorrection(t)).toBe(true)
  })
  test('a new request, a slash command or a long brief does not', () => {
    for (const t of [
      'now add a dark mode toggle',
      'no problem, next add the footer',
      'still need to add tests for the parser',
      '/compact',
      '',
      `no. ${'Here is the full spec again. '.repeat(30)}`,
    ])
      expect(isCorrection(t)).toBe(false)
  })
})

describe('loops', () => {
  const bash = (command: string, isError: boolean) => callOf('Bash', { command, tool_use_id: Math.random().toString() }, isError)
  test('the same call failing three times in the window is a loop', () => {
    const calls = [bash('pnpm test', true), bash('ls', false), bash('pnpm test', true)]
    expect(loopIn(calls)).toBeUndefined()
    calls.push(bash('pnpm test', true))
    expect(loopIn(calls)).toEqual({ kind: 'failing', what: 'Bash pnpm test', times: 3 })
  })
  test('the same call succeeding again is no loop', () => {
    expect(loopIn([bash('git status', false), bash('git status', false), bash('git status', false)])).toBeUndefined()
  })
  test('an edit that puts back what an earlier edit took out is a loop', () => {
    const edit = (from: string, to: string) =>
      callOf('Edit', { file_path: 'Z:/repo/src/app.ts', old_string: from, new_string: to }, false)
    expect(loopIn([edit('a', 'b')])).toBeUndefined()
    expect(loopIn([edit('a', 'b'), edit('b', 'a')])).toEqual({ kind: 'undo', what: 'Edit app.ts', times: 2 })
  })
})

describe('done claims', () => {
  test('a closing claim of success counts', () => {
    expect(claimsDone('I updated the parser. All tests pass.')).toBe(true)
    expect(claimsDone('The bug is fixed.')).toBe(true)
    expect(claimsDone('Done.')).toBe(true)
  })
  test('a question or a plan does not', () => {
    expect(claimsDone('Should I also update the docs?')).toBe(false)
    expect(claimsDone('Next I will fix the parser and run the tests.')).toBe(false)
  })
})
