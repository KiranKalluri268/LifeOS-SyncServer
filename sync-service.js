const collectionModels = Object.freeze([
  ['categories', 'Category'],
  ['foodLogs', 'FoodLog'],
  ['liquidLogs', 'LiquidLog'],
  ['transactions', 'Transaction'],
  ['budgets', 'Budget'],
  ['activityLogs', 'ActivityLog'],
  ['sleepLogs', 'SleepLog'],
  ['userSettings', 'UserSettings'],
])

const pullProjection = '-_id -userId -serverUpdatedAt -__v'

function serverRecord(source, userId, serverUpdatedAt) {
  const record = { ...source }
  delete record.id
  delete record.userId
  delete record.syncStatus
  delete record.categoryId
  delete record.lastSyncAt
  return { ...record, userId, serverUpdatedAt }
}

async function applyChanges(Model, items, userId, now = () => new Date()) {
  for (const source of items) {
    const existing = await Model
      .findOne({ userId, syncId: source.syncId })
      .select('updatedAt')
      .lean()

    if (existing?.updatedAt && existing.updatedAt > source.updatedAt) continue

    const record = serverRecord(source, userId, now())
    await Model.findOneAndUpdate(
      { userId, syncId: source.syncId },
      record,
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
  }
}

async function applySyncChanges(models, changes, userId, now) {
  for (const [collectionName, modelName] of collectionModels) {
    await applyChanges(
      models[modelName],
      changes[collectionName] ?? [],
      userId,
      now,
    )
  }
}

async function pullSyncChanges(
  models,
  userId,
  lastSync,
  timestamp = new Date(),
) {
  const query = {
    userId,
    serverUpdatedAt: {
      $gt: new Date(lastSync),
      $lte: timestamp,
    },
  }
  const result = await Promise.all(
    collectionModels.map(([, modelName]) =>
      models[modelName]
        .find(query)
        .select(pullProjection)
        .lean()),
  )
  const changes = Object.fromEntries(
    collectionModels.map(([collectionName], index) => [
      collectionName,
      result[index],
    ]),
  )
  return { changes, timestamp: timestamp.toISOString() }
}

module.exports = {
  applyChanges,
  applySyncChanges,
  collectionModels,
  pullSyncChanges,
  serverRecord,
}
