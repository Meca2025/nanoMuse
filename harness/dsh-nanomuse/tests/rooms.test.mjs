// The rooms' pure helpers: what the agent's final answer parses to, and the first
// title a goal gets before the agent names it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { goalTitle, parseArray } from '../lib/rooms.js'

test('parseArray takes the last fenced json block', () => {
  const text = 'Here is a draft:\n```json\n[{"title": "draft"}]\n```\nFinal:\n```json\n[{"title": "a"}, {"title": "b"}]\n```\n'
  assert.deepEqual(parseArray(text).map((r) => r.title), ['a', 'b'])
})

test('parseArray falls back to the outermost brackets, and to nothing', () => {
  assert.deepEqual(parseArray('sure: [{"title": "x", "n": 1}] done').map((r) => r.title), ['x'])
  assert.deepEqual(parseArray('no json here'), [])
  assert.deepEqual(parseArray('```json\n{"not": "an array"}\n```'), [])
  assert.deepEqual(parseArray('```json\n[1, "two", {"title": "three"}]\n```').map((r) => r.title), ['three'])
})

test('goalTitle keeps the first clause', () => {
  assert.equal(goalTitle('工作日零点前睡觉；每天 23:00 提醒我，每周日晚上问我这周睡得怎么样。'), '工作日零点前睡觉')
  assert.equal(goalTitle('Save ¥20,000 by December; track it monthly and tell me when I drift.'), 'Save ¥20,000 by December')
  assert.equal(goalTitle('Run a 10k'), 'Run a 10k')
  assert.equal(goalTitle('Hi, call my parents every Sunday'), 'Hi, call my parents every Sunday'.slice(0, 40))
  assert.equal(goalTitle('x'.repeat(80)).length, 40)
})
