const isObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isString = (value, max = 500) =>
  typeof value === 'string' && value.length > 0 && value.length <= max

const isOptionalString = (value, max = 500) =>
  value === undefined || (typeof value === 'string' && value.length <= max)

const isNumber = value => typeof value === 'number' && Number.isFinite(value)
const isIsoDate = value => isString(value, 40) && !Number.isNaN(Date.parse(value))
const isDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const isMonth = value =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
const isUuid = value =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

function validateAuthBody(body) {
  if (!isObject(body)) return 'Request body must be an object'
  if (
    typeof body.email !== 'string'
    || body.email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
  ) {
    return 'A valid email is required'
  }
  if (
    typeof body.password !== 'string'
    || body.password.length < 8
    || body.password.length > 128
  ) {
    return 'Password must be 8–128 characters'
  }
  return null
}

const commonRecordValid = item =>
  isObject(item)
  && isUuid(item.syncId)
  && typeof item.deleted === 'boolean'
  && isIsoDate(item.createdAt)
  && isIsoDate(item.updatedAt)

const validators = {
  foodLogs: item =>
    commonRecordValid(item)
    && isDay(item.date)
    && ['breakfast', 'lunch', 'dinner', 'snack', 'other'].includes(item.mealType)
    && isString(item.foodName, 200)
    && isNumber(item.calories)
    && isNumber(item.protein)
    && isNumber(item.carbs)
    && isNumber(item.fat)
    && isNumber(item.servingSize)
    && isString(item.servingUnit, 30)
    && isNumber(item.quantity)
    && ['manual', 'openfoodfacts', 'barcode'].includes(item.source)
    && isOptionalString(item.brand, 200)
    && isOptionalString(item.notes, 1000),
  liquidLogs: item =>
    commonRecordValid(item)
    && isDay(item.date)
    && ['water', 'coffee', 'tea', 'juice', 'alcohol', 'other'].includes(item.liquidType)
    && isNumber(item.amountMl)
    && item.amountMl > 0
    && item.amountMl <= 10000
    && isOptionalString(item.notes, 1000),
  categories: item =>
    commonRecordValid(item)
    && isString(item.name, 100)
    && isString(item.icon, 100)
    && isString(item.color, 30)
    && typeof item.isDefault === 'boolean',
  transactions: item =>
    commonRecordValid(item)
    && ['expense', 'income'].includes(item.type)
    && isNumber(item.amount)
    && item.amount >= 0
    && isUuid(item.categorySyncId)
    && isDay(item.date)
    && isOptionalString(item.note, 1000),
  budgets: item =>
    commonRecordValid(item)
    && isUuid(item.categorySyncId)
    && isMonth(item.month)
    && isNumber(item.amount)
    && item.amount > 0,
  activityLogs: item =>
    commonRecordValid(item)
    && isDay(item.date)
    && isString(item.category, 50)
    && isIsoDate(item.startTime)
    && isIsoDate(item.endTime)
    && isNumber(item.durationMins)
    && item.durationMins >= 0
    && isOptionalString(item.note, 1000),
  sleepLogs: item =>
    commonRecordValid(item)
    && isDay(item.date)
    && isIsoDate(item.bedtime)
    && isIsoDate(item.wakeTime)
    && isNumber(item.durationMins)
    && item.durationMins >= 0
    && Number.isInteger(item.quality)
    && item.quality >= 1
    && item.quality <= 5
    && isOptionalString(item.notes, 1000),
  userSettings: item =>
    commonRecordValid(item)
    && isNumber(item.calorieTarget)
    && item.calorieTarget > 0
    && isNumber(item.proteinTargetG)
    && item.proteinTargetG >= 0
    && isNumber(item.carbTargetG)
    && item.carbTargetG >= 0
    && isNumber(item.fatTargetG)
    && item.fatTargetG >= 0
    && isNumber(item.waterTargetMl)
    && item.waterTargetMl > 0
    && isString(item.currency, 10)
    && isString(item.currencyCode, 10)
    && [0, 1].includes(item.weekStartDay)
    && ['dark', 'light', 'system'].includes(item.theme),
}

const syncCollectionNames = Object.freeze(Object.keys(validators))

function validateChanges(body) {
  if (!isObject(body) || !isObject(body.changes)) {
    return 'changes must be an object'
  }
  if (
    Object.keys(body.changes)
      .some(key => !syncCollectionNames.includes(key))
  ) {
    return 'changes contains an unsupported collection'
  }

  let total = 0
  for (const name of syncCollectionNames) {
    const items = body.changes[name] ?? []
    if (!Array.isArray(items)) return `${name} must be an array`
    total += items.length
    if (items.some(item => !validators[name](item))) {
      return `${name} contains an invalid record`
    }
  }
  return total > 500
    ? 'A sync request may contain at most 500 records'
    : null
}

module.exports = {
  isIsoDate,
  syncCollectionNames,
  validateAuthBody,
  validateChanges,
  validators,
}
