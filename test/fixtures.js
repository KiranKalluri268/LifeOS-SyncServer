const SYNC_ID = '11111111-1111-5111-8111-111111111111'
const CATEGORY_SYNC_ID = '22222222-2222-5222-8222-222222222222'
const CREATED_AT = '2026-07-23T10:00:00.000Z'
const UPDATED_AT = '2026-07-23T11:00:00.000Z'

function metadata(overrides = {}) {
  return {
    syncId: SYNC_ID,
    deleted: false,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  }
}

function validRecords() {
  return {
    foodLogs: [{
      ...metadata(),
      date: '2026-07-23',
      mealType: 'lunch',
      foodName: 'Dal and rice',
      calories: 620,
      protein: 24,
      carbs: 92,
      fat: 16,
      servingSize: 1,
      servingUnit: 'plate',
      quantity: 1,
      source: 'manual',
    }],
    liquidLogs: [{
      ...metadata(),
      date: '2026-07-23',
      liquidType: 'water',
      amountMl: 500,
    }],
    categories: [{
      ...metadata(),
      name: 'Food & Dining',
      icon: 'UtensilsCrossed',
      color: '#f97316',
      isDefault: true,
    }],
    transactions: [{
      ...metadata(),
      type: 'expense',
      amount: 450,
      categorySyncId: CATEGORY_SYNC_ID,
      date: '2026-07-23',
    }],
    budgets: [{
      ...metadata(),
      categorySyncId: CATEGORY_SYNC_ID,
      month: '2026-07',
      amount: 12000,
    }],
    activityLogs: [{
      ...metadata(),
      date: '2026-07-23',
      category: 'deep_work',
      startTime: '2026-07-23T08:00:00.000Z',
      endTime: '2026-07-23T09:30:00.000Z',
      durationMins: 90,
    }],
    sleepLogs: [{
      ...metadata(),
      date: '2026-07-23',
      bedtime: '2026-07-22T22:30:00.000Z',
      wakeTime: '2026-07-23T06:30:00.000Z',
      durationMins: 480,
      quality: 4,
    }],
    userSettings: [{
      ...metadata(),
      calorieTarget: 2000,
      proteinTargetG: 150,
      carbTargetG: 250,
      fatTargetG: 65,
      waterTargetMl: 2500,
      currency: '₹',
      currencyCode: 'INR',
      weekStartDay: 1,
      theme: 'dark',
    }],
  }
}

module.exports = {
  CATEGORY_SYNC_ID,
  CREATED_AT,
  SYNC_ID,
  UPDATED_AT,
  metadata,
  validRecords,
}
