const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  applyChanges,
  applySyncChanges,
  collectionModels,
  pullSyncChanges,
  serverRecord,
} = require('../sync-service')
const { metadata } = require('./fixtures')

const USER_ID = 'authenticated-user'
const FIXED_NOW = new Date('2026-07-23T12:00:00.000Z')

function modelDouble({ existing = null, pulled = [] } = {}) {
  const calls = {
    find: [],
    findOne: [],
    findOneAndUpdate: [],
    projections: [],
  }

  return {
    calls,
    find(query) {
      calls.find.push(query)
      return {
        select(projection) {
          calls.projections.push(projection)
          return { lean: async () => pulled }
        },
      }
    },
    findOne(query) {
      calls.findOne.push(query)
      return {
        select(projection) {
          calls.projections.push(projection)
          return { lean: async () => existing }
        },
      }
    },
    async findOneAndUpdate(query, record, options) {
      calls.findOneAndUpdate.push({ query, record, options })
    },
  }
}

function modelSet(factory = () => modelDouble()) {
  return Object.fromEntries(
    collectionModels.map(([, modelName]) => [modelName, factory(modelName)]),
  )
}

test('server records discard local-only fields and enforce authenticated ownership', () => {
  const record = serverRecord({
    ...metadata({ deleted: true }),
    id: 42,
    userId: 'attacker-selected-user',
    syncStatus: 'pending',
    categoryId: 7,
    lastSyncAt: 'device-only',
    amount: 500,
  }, USER_ID, FIXED_NOW)

  assert.equal(record.id, undefined)
  assert.equal(record.syncStatus, undefined)
  assert.equal(record.categoryId, undefined)
  assert.equal(record.lastSyncAt, undefined)
  assert.equal(record.userId, USER_ID)
  assert.equal(record.deleted, true)
  assert.equal(record.amount, 500)
  assert.equal(record.serverUpdatedAt, FIXED_NOW)
})

test('push lookup and upsert are scoped to the authenticated account', async () => {
  const model = modelDouble()
  const source = { ...metadata(), userId: 'other-user', amount: 100 }

  await applyChanges(model, [source], USER_ID, () => FIXED_NOW)

  assert.deepEqual(model.calls.findOne, [{
    userId: USER_ID,
    syncId: source.syncId,
  }])
  assert.equal(model.calls.findOneAndUpdate.length, 1)
  const upsert = model.calls.findOneAndUpdate[0]
  assert.deepEqual(upsert.query, {
    userId: USER_ID,
    syncId: source.syncId,
  })
  assert.equal(upsert.record.userId, USER_ID)
  assert.equal(upsert.record.serverUpdatedAt, FIXED_NOW)
  assert.deepEqual(upsert.options, {
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  })
})

test('a newer stored client timestamp wins over an older pushed record', async () => {
  const model = modelDouble({
    existing: { updatedAt: '2026-07-23T13:00:00.000Z' },
  })

  await applyChanges(model, [metadata()], USER_ID, () => FIXED_NOW)

  assert.equal(model.calls.findOneAndUpdate.length, 0)
})

test('an equal timestamp is safe to upsert idempotently', async () => {
  const source = metadata()
  const model = modelDouble({ existing: { updatedAt: source.updatedAt } })

  await applyChanges(model, [source], USER_ID, () => FIXED_NOW)

  assert.equal(model.calls.findOneAndUpdate.length, 1)
})

test('push dispatch covers every synchronized collection', async () => {
  const models = modelSet()
  const changes = Object.fromEntries(
    collectionModels.map(([collectionName]) => [
      collectionName,
      [metadata()],
    ]),
  )

  await applySyncChanges(models, changes, USER_ID, () => FIXED_NOW)

  for (const [, modelName] of collectionModels) {
    assert.equal(
      models[modelName].calls.findOneAndUpdate.length,
      1,
      `${modelName} should receive one upsert`,
    )
  }
})

test('omitted push collections are treated as empty', async () => {
  const models = modelSet()

  await applySyncChanges(models, {}, USER_ID, () => FIXED_NOW)

  for (const [, modelName] of collectionModels) {
    assert.equal(models[modelName].calls.findOne.length, 0)
    assert.equal(models[modelName].calls.findOneAndUpdate.length, 0)
  }
})

test('pull queries every collection within one tenant-scoped cursor window', async () => {
  const models = modelSet(modelName =>
    modelDouble({ pulled: [{ modelName }] }))
  const lastSync = '2026-07-23T10:00:00.000Z'

  const response = await pullSyncChanges(
    models,
    USER_ID,
    lastSync,
    FIXED_NOW,
  )

  assert.equal(response.timestamp, FIXED_NOW.toISOString())
  for (const [collectionName, modelName] of collectionModels) {
    assert.deepEqual(response.changes[collectionName], [{ modelName }])
    assert.equal(models[modelName].calls.find.length, 1)
    const query = models[modelName].calls.find[0]
    assert.equal(query.userId, USER_ID)
    assert.equal(query.serverUpdatedAt.$gt.toISOString(), lastSync)
    assert.equal(query.serverUpdatedAt.$lte, FIXED_NOW)
    assert.equal(
      models[modelName].calls.projections[0],
      '-_id -userId -serverUpdatedAt -__v',
    )
  }
})

test('model failures propagate so the route can return a sync error', async () => {
  const model = modelDouble()
  model.findOneAndUpdate = async () => {
    throw new Error('database unavailable')
  }

  await assert.rejects(
    applyChanges(model, [metadata()], USER_ID, () => FIXED_NOW),
    /database unavailable/,
  )
})
