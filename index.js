require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const models = require('./models')
const {
  isIsoDate,
  validateAuthBody,
  validateChanges,
} = require('./validation')
const {
  applySyncChanges,
  pullSyncChanges,
} = require('./sync-service')
const { createAuthenticate } = require('./auth-middleware')

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

const authenticate = createAuthenticate(jwt, JWT_SECRET)

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
    await applySyncChanges(models, req.body.changes, req.userId)
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
    res.json(await pullSyncChanges(models, req.userId, lastSync))
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
