require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const models = require('./models')

const app = express()

// CORS — use function-based origin handler so it is evaluated per-request
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173']

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`CORS blocked origin: ${origin}`)
      callback(new Error(`Origin ${origin} not allowed by CORS`))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(cors(corsOptions))
// Explicitly handle preflight OPTIONS for all routes
app.options('*', cors(corsOptions))
app.use(express.json({ limit: '10mb' }))

// DB connection
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lifetrack')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => { console.error('MongoDB connection failed:', err); process.exit(1) })

// JWT secret — must be set explicitly in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var is required in production')
  process.exit(1)
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-prod'

// Middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.userId
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body
    const hash = await bcrypt.hash(password, 10)
    const user = await models.User.create({ email, password: hash })
    const token = jwt.sign({ userId: user._id }, JWT_SECRET)
    res.json({ token, userId: user._id })
  } catch (err) {
    res.status(400).json({ error: 'Registration failed' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await models.User.findOne({ email })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const token = jwt.sign({ userId: user._id }, JWT_SECRET)
    res.json({ token, userId: user._id })
  } catch (err) {
    res.status(400).json({ error: 'Login failed' })
  }
})

// Sync Push (Client -> Server)
app.post('/api/sync/push', auth, async (req, res) => {
  try {
    const { changes } = req.body
    // changes is an object: { foodLogs: [...], categories: [...], ... }
    
    const applyChanges = async (Model, items) => {
      if (!items || !items.length) return
      for (const item of items) {
        item.userId = req.userId
        item.clientId = item.id // Store Dexie ID as clientId
        delete item.id // remove dexie id so mongoose doesn't complain or use it as _id

        // Upsert by clientId
        await Model.findOneAndUpdate(
          { userId: req.userId, clientId: item.clientId },
          item,
          { upsert: true, new: true }
        )
      }
    }

    await applyChanges(models.FoodLog, changes.foodLogs)
    await applyChanges(models.Category, changes.categories)
    await applyChanges(models.Transaction, changes.transactions)
    await applyChanges(models.ActivityLog, changes.activityLogs)
    await applyChanges(models.SleepLog, changes.sleepLogs)

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Sync failed' })
  }
})

// Sync Pull (Server -> Client)
app.get('/api/sync/pull', auth, async (req, res) => {
  try {
    const lastSync = req.query.lastSync || '1970-01-01T00:00:00.000Z'
    
    // Find all records updated after lastSync
    const query = { userId: req.userId, updatedAt: { $gt: lastSync } }

    const foodLogs = await models.FoodLog.find(query).lean()
    const categories = await models.Category.find(query).lean()
    const transactions = await models.Transaction.find(query).lean()
    const activityLogs = await models.ActivityLog.find(query).lean()
    const sleepLogs = await models.SleepLog.find(query).lean()

    // Map clientId back to id for Dexie
    const mapToClient = (items) => items.map(i => {
      const { _id, userId, clientId, __v, ...rest } = i
      return { id: clientId, ...rest }
    })

    res.json({
      changes: {
        foodLogs: mapToClient(foodLogs),
        categories: mapToClient(categories),
        transactions: mapToClient(transactions),
        activityLogs: mapToClient(activityLogs),
        sleepLogs: mapToClient(sleepLogs),
      },
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Pull failed' })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
