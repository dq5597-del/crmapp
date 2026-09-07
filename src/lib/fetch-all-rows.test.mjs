import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAllRows } from './fetch-all-rows.ts'

for (const length of [0, 500, 1324]) {
  test(`loads all ${length} records`, async () => {
    const expected = Array.from({ length }, (_, id) => ({ id }))
    const result = await fetchAllRows(async (from, to) => ({
      data: expected.slice(from, to + 1), error: null,
    }))
    assert.deepEqual(result.data, expected)
  })
}
test('continues when the server caps pages below the requested size', async () => {
  const expected = Array.from({ length: 1324 }, (_, id) => ({ id }))
  const result = await fetchAllRows(async (from) => ({
    data: expected.slice(from, from + 100), error: null,
  }))
  assert.deepEqual(result.data, expected)
})
test('rejects partial results after an API failure', async () => {
  await assert.rejects(fetchAllRows(async (from) => from === 0
    ? { data: [{ id: 1 }], error: null }
    : { data: null, error: { message: 'connection failed' } }), /connection failed/)
})
