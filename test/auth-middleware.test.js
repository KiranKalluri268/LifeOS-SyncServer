const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createAuthenticate } = require('../auth-middleware')

const SECRET = 'test-secret'

function responseDouble() {
  const result = { statusCode: null, body: null }
  return {
    result,
    status(code) {
      result.statusCode = code
      return this
    },
    json(body) {
      result.body = body
      return this
    },
  }
}

test('authentication rejects requests without a bearer token', () => {
  const jwt = { verify: () => assert.fail('verify should not be called') }
  const authenticate = createAuthenticate(jwt, SECRET)
  const req = { headers: {} }
  const res = responseDouble()
  let nextCalled = false

  authenticate(req, res, () => { nextCalled = true })

  assert.equal(nextCalled, false)
  assert.equal(res.result.statusCode, 401)
  assert.deepEqual(res.result.body, { error: 'Unauthorized' })
})

test('authentication rejects invalid or expired tokens', () => {
  const jwt = {
    verify(token, secret) {
      assert.equal(token, 'expired-token')
      assert.equal(secret, SECRET)
      throw new Error('jwt expired')
    },
  }
  const authenticate = createAuthenticate(jwt, SECRET)
  const req = { headers: { authorization: 'Bearer expired-token' } }
  const res = responseDouble()

  authenticate(req, res, () => assert.fail('next should not be called'))

  assert.equal(res.result.statusCode, 401)
  assert.deepEqual(res.result.body, { error: 'Invalid or expired token' })
})

test('authentication rejects a validly decoded token without an account ID', () => {
  const jwt = { verify: () => ({ purpose: 'access' }) }
  const authenticate = createAuthenticate(jwt, SECRET)
  const req = { headers: { authorization: 'Bearer identity-free-token' } }
  const res = responseDouble()

  authenticate(req, res, () => assert.fail('next should not be called'))

  assert.equal(res.result.statusCode, 401)
  assert.deepEqual(res.result.body, { error: 'Invalid or expired token' })
})

test('authentication scopes the request to the verified account', () => {
  const jwt = { verify: () => ({ userId: 'account-a' }) }
  const authenticate = createAuthenticate(jwt, SECRET)
  const req = { headers: { authorization: 'Bearer valid-token' } }
  const res = responseDouble()
  let nextCalled = false

  authenticate(req, res, () => { nextCalled = true })

  assert.equal(nextCalled, true)
  assert.equal(req.userId, 'account-a')
  assert.equal(res.result.statusCode, null)
})
