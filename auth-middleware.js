function createAuthenticate(jwt, secret) {
  return (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ')
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      const payload = jwt.verify(token, secret)
      if (
        typeof payload.userId !== 'string'
        || payload.userId.length === 0
      ) {
        throw new Error('Token has no user identity')
      }
      req.userId = payload.userId
      next()
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
    }
  }
}

module.exports = { createAuthenticate }
