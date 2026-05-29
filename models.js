const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
})

const FoodLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: Number, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  name: { type: String, required: true },
  calories: { type: Number, required: true },
  protein: { type: Number, required: true },
  waterTotal: { type: Number, default: 0 },
  createdAt: { type: String },
  updatedAt: { type: String },
  deleted: { type: Boolean, default: false }
})

const CategorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: Number, required: true },
  name: { type: String, required: true },
  emoji: { type: String, required: true },
  color: { type: String, required: true },
  budget: { type: Number },
  createdAt: { type: String },
  updatedAt: { type: String },
  deleted: { type: Boolean, default: false }
})

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: Number, required: true },
  type: { type: String, enum: ['expense', 'income'], required: true },
  amount: { type: Number, required: true },
  categoryId: { type: Number, required: true },
  date: { type: String, required: true },
  note: { type: String },
  createdAt: { type: String },
  updatedAt: { type: String },
  deleted: { type: Boolean, default: false }
})

const ActivityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: Number, required: true },
  date: { type: String, required: true },
  category: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  durationMins: { type: Number, required: true },
  note: { type: String },
  createdAt: { type: String },
  updatedAt: { type: String },
  deleted: { type: Boolean, default: false }
})

const SleepLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: Number, required: true },
  date: { type: String, required: true },
  bedtime: { type: String, required: true },
  wakeTime: { type: String, required: true },
  durationMins: { type: Number, required: true },
  quality: { type: Number, required: true },
  notes: { type: String },
  createdAt: { type: String },
  updatedAt: { type: String },
  deleted: { type: Boolean, default: false }
})

module.exports = {
  User: mongoose.model('User', UserSchema),
  FoodLog: mongoose.model('FoodLog', FoodLogSchema),
  Category: mongoose.model('Category', CategorySchema),
  Transaction: mongoose.model('Transaction', TransactionSchema),
  ActivityLog: mongoose.model('ActivityLog', ActivityLogSchema),
  SleepLog: mongoose.model('SleepLog', SleepLogSchema),
}
