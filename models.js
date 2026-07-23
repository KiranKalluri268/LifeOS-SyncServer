const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
}, { timestamps: true })

const syncFields = {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  syncId: { type: String, required: true },
  deleted: { type: Boolean, default: false },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
  serverUpdatedAt: { type: Date, required: true, default: Date.now },
}

function syncSchema(fields) {
  const schema = new mongoose.Schema({ ...syncFields, ...fields }, { strict: 'throw' })
  schema.index(
    { userId: 1, syncId: 1 },
    { unique: true, partialFilterExpression: { syncId: { $type: 'string' } } },
  )
  schema.index({ userId: 1, serverUpdatedAt: 1 })
  return schema
}

const FoodLogSchema = syncSchema({
  date: { type: String, required: true },
  mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack', 'other'], required: true },
  foodName: { type: String, required: true },
  brand: String,
  calories: { type: Number, required: true },
  protein: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fat: { type: Number, required: true },
  fiber: Number,
  servingSize: { type: Number, required: true },
  servingUnit: { type: String, required: true },
  quantity: { type: Number, required: true },
  barcode: String,
  source: { type: String, enum: ['manual', 'openfoodfacts', 'barcode'], required: true },
  notes: String,
})

const LiquidLogSchema = syncSchema({
  date: { type: String, required: true },
  liquidType: {
    type: String,
    enum: ['water', 'coffee', 'tea', 'juice', 'alcohol', 'other'],
    required: true,
  },
  amountMl: { type: Number, required: true },
  notes: String,
})

const CategorySchema = syncSchema({
  name: { type: String, required: true },
  icon: { type: String, required: true },
  color: { type: String, required: true },
  isDefault: { type: Boolean, required: true },
})

const TransactionSchema = syncSchema({
  type: { type: String, enum: ['expense', 'income'], required: true },
  amount: { type: Number, required: true },
  categorySyncId: { type: String, required: true },
  date: { type: String, required: true },
  note: String,
})

const BudgetSchema = syncSchema({
  categorySyncId: { type: String, required: true },
  month: { type: String, required: true },
  amount: { type: Number, required: true },
})

const ActivityLogSchema = syncSchema({
  date: { type: String, required: true },
  category: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  durationMins: { type: Number, required: true },
  note: String,
})

const SleepLogSchema = syncSchema({
  date: { type: String, required: true },
  bedtime: { type: String, required: true },
  wakeTime: { type: String, required: true },
  durationMins: { type: Number, required: true },
  quality: { type: Number, min: 1, max: 5, required: true },
  notes: String,
})

const UserSettingsSchema = syncSchema({
  calorieTarget: { type: Number, required: true },
  proteinTargetG: { type: Number, required: true },
  carbTargetG: { type: Number, required: true },
  fatTargetG: { type: Number, required: true },
  waterTargetMl: { type: Number, required: true },
  currency: { type: String, required: true },
  currencyCode: { type: String, required: true },
  weekStartDay: { type: Number, enum: [0, 1], required: true },
  theme: { type: String, enum: ['dark', 'light', 'system'], required: true },
})
UserSettingsSchema.index({ userId: 1 }, { unique: true })

module.exports = {
  User: mongoose.model('User', UserSchema),
  FoodLog: mongoose.model('FoodLog', FoodLogSchema),
  LiquidLog: mongoose.model('LiquidLog', LiquidLogSchema),
  Category: mongoose.model('Category', CategorySchema),
  Transaction: mongoose.model('Transaction', TransactionSchema),
  Budget: mongoose.model('Budget', BudgetSchema),
  ActivityLog: mongoose.model('ActivityLog', ActivityLogSchema),
  SleepLog: mongoose.model('SleepLog', SleepLogSchema),
  UserSettings: mongoose.model('UserSettings', UserSettingsSchema),
}
