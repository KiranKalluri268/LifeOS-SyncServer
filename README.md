# LifeOS Sync Server

The LifeOS Sync Server provides account authentication and MongoDB-backed sync
for the separate LifeOS browser client. It is an Express 5 API using JWT bearer
tokens and Mongoose models.

This directory is an independent Git repository. The user interface lives in
the sibling `client` repository and must be configured and run separately.

## Responsibilities

- Register users and hash passwords with bcrypt
- Authenticate users and issue JWTs
- Accept client-side changes and upsert them by user and UUID sync identity
- Return records updated since a supplied timestamp
- Restrict browser requests to configured frontend origins

## Architecture

```mermaid
flowchart LR
    Client[LifeOS Client]

    subgraph API[Express 5 API]
        CORS[CORS middleware]
        JSON[JSON body parser]

        subgraph AuthRoutes[Authentication routes]
            Register[POST /api/auth/register]
            Login[POST /api/auth/login]
            Password[bcrypt password hashing]
            Tokens[JWT signing]
        end

        Guard[JWT authentication middleware]

        subgraph SyncRoutes[Protected synchronization routes]
            Push[POST /api/sync/push]
            Pull[GET /api/sync/pull]
        end

        Models[Mongoose models]
    end

    Mongo[(MongoDB)]

    Client --> CORS --> JSON
    JSON --> Register
    JSON --> Login
    Register --> Password
    Login --> Password
    Register --> Tokens
    Login --> Tokens

    JSON --> Guard
    Guard --> Push
    Guard --> Pull
    Push --> Models
    Pull --> Models
    Register --> Models
    Login --> Models
    Models <--> Mongo

    Tokens --> Client
    Pull --> Client
    Push --> Client
```

Authentication routes are public. Sync routes pass through the JWT guard, which
sets the authenticated user ID used to scope every MongoDB query and upsert.

## Requirements

- Node.js 18 or newer
- npm
- MongoDB, either local or hosted

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Set at least `MONGODB_URI` and a strong `JWT_SECRET` in `.env`.

4. Start the API:

   ```bash
   npm run dev
   ```

5. Configure the client with `VITE_API_URL=http://localhost:3001`.

The server listens on `http://localhost:3001` by default. Its default CORS
allowlist includes `http://localhost:5173` and `http://localhost:4173` when
`FRONTEND_URL` is not set.

`GET /api/health` reports API and MongoDB readiness. It returns `200` while
MongoDB is connected and `503` while the API is degraded.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Production | MongoDB connection URI; defaults to `mongodb://localhost:27017/lifetrack` |
| `JWT_SECRET` | Production | Secret used to sign and verify JWTs; the process exits if absent in production |
| `JWT_EXPIRES_IN` | No | JWT lifetime accepted by `jsonwebtoken`; defaults to `7d` |
| `FRONTEND_URL` | No | Comma-separated exact origins allowed by CORS |
| `NODE_ENV` | No | Set to `production` to enforce a configured JWT secret |
| `PORT` | No | HTTP port; defaults to `3001` |

Generate a production JWT secret with a cryptographically secure tool, for
example `openssl rand -hex 64`. Never commit `.env`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the server with Node.js |
| `npm run dev` | Start with Node.js watch mode |

The package contains a placeholder `test` script; there is currently no
automated test suite.

## API

All request and response bodies are JSON. Sync routes require this header:

```http
Authorization: Bearer <token>
```

### `POST /api/auth/register`

Creates an account and returns a token.

```json
{
  "email": "person@example.com",
  "password": "a-strong-password"
}
```

Successful response:

```json
{
  "token": "<jwt>",
  "userId": "<mongo-object-id>"
}
```

### `POST /api/auth/login`

Accepts the same body and returns the same response shape. Invalid credentials
return `401`.

### `POST /api/sync/push`

Upserts records by the authenticated `userId` and the record's stable UUID
`syncId`. Local numeric IndexedDB IDs are ignored by the API.

```json
{
  "changes": {
    "foodLogs": [],
    "categories": [],
    "transactions": [],
    "activityLogs": [],
    "sleepLogs": []
  }
}
```

Successful response: `{ "success": true }`.

### `GET /api/sync/pull?lastSync=<ISO-8601 timestamp>`

Returns records whose server-generated sync timestamp is later than `lastSync`.
If omitted, the timestamp defaults to the Unix epoch.

```json
{
  "changes": {
    "foodLogs": [],
    "categories": [],
    "transactions": [],
    "activityLogs": [],
    "sleepLogs": []
  },
  "timestamp": "2026-01-01T12:00:00.000Z"
}
```

MongoDB-only fields are removed. `syncId` is returned unchanged and the client
resolves it to the appropriate local IndexedDB ID.

## Data model and sync behavior

`models.js` defines `User`, `FoodLog`, `Category`, `Transaction`, `ActivityLog`,
and `SleepLog`. Each synchronized record belongs to a user and carries a UUID.
A unique compound index on `(userId, syncId)` makes repeated writes idempotent.

The API does not currently expose hydration, budgets, timers, settings, or food
cache. Deletion uses a `deleted` tombstone sent through the normal sync endpoint.

## Sync constraints

Client timestamps are ISO-8601 strings and conflict resolution compares those
timestamps lexicographically, so device clocks should be reasonably accurate.
Incremental pull watermarks use a separate server-generated timestamp so clock
skew cannot cause records to be skipped.
Hydration, budgets, timers, settings, and food cache remain local-only. The
rate limiter is held in process memory and needs a shared store before scaling
the API to multiple instances.

## Production notes

- Set `NODE_ENV=production`, `JWT_SECRET`, `MONGODB_URI`, and the exact deployed
  client origin in `FRONTEND_URL`.
- Multiple frontend origins may be comma-separated, with no path component.
- Run behind HTTPS and a production process manager or hosting platform.
- Add refresh tokens, structured production logging, a shared rate-limit store,
  and automated tests before exposing the API to untrusted users.
- Avoid logging credentials, tokens, or MongoDB connection strings.
