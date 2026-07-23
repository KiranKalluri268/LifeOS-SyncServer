const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  isIsoDate,
  syncCollectionNames,
  validateAuthBody,
  validateChanges,
  validators,
} = require('../validation')
const { metadata, validRecords } = require('./fixtures')

test('authentication accepts a valid email and bounded password', () => {
  assert.equal(validateAuthBody({
    email: 'person@example.com',
    password: 'correct-horse',
  }), null)
})

test('authentication rejects malformed bodies, emails, and passwords', () => {
  assert.equal(validateAuthBody(null), 'Request body must be an object')
  assert.equal(
    validateAuthBody({ email: 'not-an-email', password: 'correct-horse' }),
    'A valid email is required',
  )
  assert.equal(
    validateAuthBody({ email: 'person@example.com', password: 'short' }),
    'Password must be 8–128 characters',
  )
  assert.equal(
    validateAuthBody({ email: 'person@example.com', password: 'x'.repeat(129) }),
    'Password must be 8–128 characters',
  )
})

test('the complete sync contract accepts every supported collection', () => {
  assert.deepEqual(syncCollectionNames, [
    'foodLogs',
    'liquidLogs',
    'categories',
    'transactions',
    'budgets',
    'activityLogs',
    'sleepLogs',
    'userSettings',
  ])
  assert.equal(validateChanges({ changes: validRecords() }), null)
})

test('sync payload shape rejects missing, unknown, and non-array collections', () => {
  assert.equal(validateChanges(null), 'changes must be an object')
  assert.equal(validateChanges({}), 'changes must be an object')
  assert.equal(
    validateChanges({ changes: { privateNotes: [] } }),
    'changes contains an unsupported collection',
  )
  assert.equal(
    validateChanges({ changes: { foodLogs: {} } }),
    'foodLogs must be an array',
  )
})

test('sync payloads enforce the 500-record request limit', () => {
  const record = validRecords().categories[0]
  assert.equal(validateChanges({
    changes: { categories: Array.from({ length: 500 }, () => record) },
  }), null)
  assert.equal(validateChanges({
    changes: { categories: Array.from({ length: 501 }, () => record) },
  }), 'A sync request may contain at most 500 records')
})

test('common sync metadata must include UUID identity and valid timestamps', () => {
  const record = validRecords().foodLogs[0]
  assert.equal(validators.foodLogs({ ...record, syncId: 'local-12' }), false)
  assert.equal(validators.foodLogs({ ...record, deleted: 'false' }), false)
  assert.equal(validators.foodLogs({ ...record, updatedAt: 'not-a-date' }), false)
})

test('hydration boundaries reject zero and implausibly large entries', () => {
  const record = validRecords().liquidLogs[0]
  assert.equal(validators.liquidLogs({ ...record, amountMl: 1 }), true)
  assert.equal(validators.liquidLogs({ ...record, amountMl: 10000 }), true)
  assert.equal(validators.liquidLogs({ ...record, amountMl: 0 }), false)
  assert.equal(validators.liquidLogs({ ...record, amountMl: 10001 }), false)
})

test('budgets require a valid month, category identity, and positive amount', () => {
  const record = validRecords().budgets[0]
  assert.equal(validators.budgets(record), true)
  assert.equal(validators.budgets({ ...record, month: '2026-13' }), false)
  assert.equal(validators.budgets({ ...record, categorySyncId: 'category-1' }), false)
  assert.equal(validators.budgets({ ...record, amount: 0 }), false)
})

test('sleep quality and settings preferences stay within supported ranges', () => {
  const sleep = validRecords().sleepLogs[0]
  const settings = validRecords().userSettings[0]
  assert.equal(validators.sleepLogs({ ...sleep, quality: 1 }), true)
  assert.equal(validators.sleepLogs({ ...sleep, quality: 5 }), true)
  assert.equal(validators.sleepLogs({ ...sleep, quality: 0 }), false)
  assert.equal(validators.sleepLogs({ ...sleep, quality: 2.5 }), false)
  assert.equal(validators.userSettings({ ...settings, weekStartDay: 2 }), false)
  assert.equal(validators.userSettings({ ...settings, theme: 'sepia' }), false)
})

test('tombstones remain valid when the original record fields are preserved', () => {
  assert.equal(validators.categories({
    ...validRecords().categories[0],
    ...metadata({ deleted: true }),
  }), true)
})

test('pull cursor validation distinguishes parseable timestamps', () => {
  assert.equal(isIsoDate('2026-07-23T12:00:00.000Z'), true)
  assert.equal(isIsoDate('not-a-date'), false)
  assert.equal(isIsoDate(undefined), false)
})
