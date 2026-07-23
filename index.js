require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const models = require('./models')

const app = express()
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://localhost:4173']

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`Origin ${origin} not allowed by CORS`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(cors(corsOptions))
app.options('/{*path}', cors(corsOptions))
app.use(express.json({ limit: '1mb' }))

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lifetrack')
  .then(() => console.log('MongoDB connected'))
  .catch(error => { console.error('MongoDB connection failed:', error); process.exit(1) })

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is required in production')
  process.exit(1)
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-prod'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

// Small in-memory limiter suitable for a single API instance. Use a shared
// store such as Redis before scaling the service horizontally.
function rateLimit({ windowMs, max }) {
  const clients = new Map()
  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, value] of clients) if (value.resetAt <= now) clients.delete(key)
  }, windowMs)
  cleanup.unref()

  return (req, res, next) => {
    const now = Date.now()
    const key = req.ip
    const current = clients.get(key)
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
    entry.count += 1
    clients.set(key, entry)
    res.set('RateLimit-Limit', String(max))
    res.set('RateLimit-Remaining', String(Math.max(0, max - entry.count)))
    res.set('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))
    if (entry.count > max) return res.status(429).json({ error: 'Too many requests; try again later' })
    next()
  }
}

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })
const syncLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 })

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isString = (value, max = 500) => typeof value === 'string' && value.length > 0 && value.length <= max
const isOptionalString = (value, max = 500) => value === undefined || (typeof value === 'string' && value.length <= max)
const isNumber = value => typeof value === 'number' && Number.isFinite(value)
const isIsoDate = value => isString(value, 40) && !Number.isNaN(Date.parse(value))
const isDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const isMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

function validateAuthBody(body) {
  if (!isObject(body)) return 'Request body must be an object'
  if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return 'A valid email is required'
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return 'Password must be 8–128 characters'
  return null
}

const commonRecordValid = item => isObject(item) && isUuid(item.syncId) && typeof item.deleted === 'boolean' && isIsoDate(item.createdAt) && isIsoDate(item.updatedAt)
const validators = {
  foodLogs: item => commonRecordValid(item) && isDay(item.date) && ['breakfast', 'lunch', 'dinner', 'snack', 'other'].includes(item.mealType) && isString(item.foodName, 200) && isNumber(item.calories) && isNumber(item.protein) && isNumber(item.carbs) && isNumber(item.fat) && isNumber(item.servingSize) && isString(item.servingUnit, 30) && isNumber(item.quantity) && ['manual', 'openfoodfacts', 'barcode'].includes(item.source) && isOptionalString(item.brand, 200) && isOptionalString(item.notes, 1000),
  liquidLogs: item => commonRecordValid(item) && isDay(item.date) && ['water', 'coffee', 'tea', 'juice', 'alcohol', 'other'].includes(item.liquidType) && isNumber(item.amountMl) && item.amountMl > 0 && item.amountMl <= 10000 && isOptionalString(item.notes, 1000),
  categories: item => commonRecordValid(item) && isString(item.name, 100) && isString(item.icon, 100) && isString(item.color, 30) && typeof item.isDefault === 'boolean',
  transactions: item => commonRecordValid(item) && ['expense', 'income'].includes(item.type) && isNumber(item.amount) && item.amount >= 0 && isUuid(item.categorySyncId) && isDay(item.date) && isOptionalString(item.note, 1000),
  budgets: item => commonRecordValid(item) && isUuid(item.categorySyncId) && isMonth(item.month) && isNumber(item.amount) && item.amount > 0,
  activityLogs: item => commonRecordValid(item) && isDay(item.date) && isString(item.category, 50) && isIsoDate(item.startTime) && isIsoDate(item.endTime) && isNumber(item.durationMins) && item.durationMins >= 0 && isOptionalString(item.note, 1000),
  sleepLogs: item => commonRecordValid(item) && isDay(item.date) && isIsoDate(item.bedtime) && isIsoDate(item.wakeTime) && isNumber(item.durationMins) && item.durationMins >= 0 && Number.isInteger(item.quality) && item.quality >= 1 && item.quality <= 5 && isOptionalString(item.notes, 1000),
  userSettings: item => commonRecordValid(item) && isNumber(item.calorieTarget) && item.calorieTarget > 0 && isNumber(item.proteinTargetG) && item.proteinTargetG >= 0 && isNumber(item.carbTargetG) && item.carbTargetG >= 0 && isNumber(item.fatTargetG) && item.fatTargetG >= 0 && isNumber(item.waterTargetMl) && item.waterTargetMl > 0 && isString(item.currency, 10) && isString(item.currencyCode, 10) && [0, 1].includes(item.weekStartDay) && ['dark', 'light', 'system'].includes(item.theme),
}

function validateChanges(body) {
  if (!isObject(body) || !isObject(body.changes)) return 'changes must be an object'
  const allowed = Object.keys(validators)
  if (Object.keys(body.changes).some(key => !allowed.includes(key))) return 'changes contains an unsupported collection'
  let total = 0
  for (const name of allowed) {
    const items = body.changes[name] ?? []
    if (!Array.isArray(items)) return `${name} must be an array`
    total += items.length
    if (items.some(item => !validators[name](item))) return `${name} contains an invalid record`
  }
  return total > 500 ? 'A sync request may contain at most 500 records' : null
}

function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.userId = jwt.verify(token, JWT_SECRET).userId
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

app.get('/api/health', (_req, res) => {
  const database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  res.status(database === 'connected' ? 200 : 503).json({ status: database === 'connected' ? 'ok' : 'degraded', database })
})

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const validationError = validateAuthBody(req.body)
  if (validationError) return res.status(400).json({ error: validationError })
  try {
    const email = req.body.email.trim().toLowerCase()
    const password = await bcrypt.hash(req.body.password, 12)
    const user = await models.User.create({ email, password })
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
    res.status(201).json({ token, userId: user._id })
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'An account with that email already exists' })
    res.status(500).json({ error: 'Registration failed' })
  }
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const validationError = validateAuthBody(req.body)
  if (validationError) return res.status(400).json({ error: validationError })
  try {
    const user = await models.User.findOne({ email: req.body.email.trim().toLowerCase() })
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ error: 'Invalid credentials' })
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
    res.json({ token, userId: user._id })
  } catch {
    res.status(500).json({ error: 'Login failed' })
  }
})

app.post('/api/sync/push', syncLimiter, authenticate, async (req, res) => {
  const validationError = validateChanges(req.body)
  if (validationError) return res.status(400).json({ error: validationError })

  try {
    const applyChanges = async (Model, items) => {
      for (const source of items) {
        const existing = await Model.findOne({ userId: req.userId, syncId: source.syncId }).select('updatedAt').lean()
        if (existing?.updatedAt && existing.updatedAt > source.updatedAt) continue
        const { id, userId, syncStatus, categoryId, lastSyncAt, ...record } = source
        await Model.findOneAndUpdate(
          { userId: req.userId, syncId: record.syncId },
          { ...record, userId: req.userId, serverUpdatedAt: new Date() },
          { upsert: true, runValidators: true, setDefaultsOnInsert: true },
        )
      }
    }

    const { changes } = req.body
    await applyChanges(models.Category, changes.categories ?? [])
    await applyChanges(models.FoodLog, changes.foodLogs ?? [])
    await applyChanges(models.LiquidLog, changes.liquidLogs ?? [])
    await applyChanges(models.Transaction, changes.transactions ?? [])
    await applyChanges(models.Budget, changes.budgets ?? [])
    await applyChanges(models.ActivityLog, changes.activityLogs ?? [])
    await applyChanges(models.SleepLog, changes.sleepLogs ?? [])
    await applyChanges(models.UserSettings, changes.userSettings ?? [])
    res.json({ success: true })
  } catch (error) {
    console.error('Sync push failed:', error)
    res.status(500).json({ error: 'Sync failed' })
  }
})

app.get('/api/sync/pull', syncLimiter, authenticate, async (req, res) => {
  const lastSync = req.query.lastSync || '1970-01-01T00:00:00.000Z'
  if (!isIsoDate(lastSync)) return res.status(400).json({ error: 'lastSync must be an ISO-8601 timestamp' })

  try {
    const timestamp = new Date()
    const query = { userId: req.userId, serverUpdatedAt: { $gt: new Date(lastSync), $lte: timestamp } }
    const [
      foodLogs,
      liquidLogs,
      categories,
      transactions,
      budgets,
      activityLogs,
      sleepLogs,
      userSettings,
    ] = await Promise.all([
      models.FoodLog.find(query).select('-_id -userId -serverUpdatedAt -__v').lean(),
      models.LiquidLog.find(query).select('-_id -userId -serverUpdatedAt -__v').lean(),
      models.Category.find(query).select('-_id -userId -serverUpdatedAt -__v').lean(),
      models.Transaction.find(query).select('-_id -userId -serverUpdatedAt -__v').lean(),
      models.Budget.find(query).select('-_id -userId -serverUpdatedAt -__v').lean(),
      models.ActivityLog.find(query).select('-_id -userId -serverUpdatedAt -__v').lean(),
      models.SleepLog.find(query).select('-_id -userId -serverUpdatedAt -__v').lean(),
      models.UserSettings.find(query).select('-_id -userId -serverUpdatedAt -__v').lean(),
    ])
    res.json({
      changes: {
        foodLogs,
        liquidLogs,
        categories,
        transactions,
        budgets,
        activityLogs,
        sleepLogs,
        userSettings,
      },
      timestamp: timestamp.toISOString(),
    })
  } catch (error) {
    console.error('Sync pull failed:', error)
    res.status(500).json({ error: 'Pull failed' })
  }
})

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON body' })
  console.error(error)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`))
