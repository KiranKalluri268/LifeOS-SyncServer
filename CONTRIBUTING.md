# Contributing to LifeOS Sync Server

Thank you for contributing to the LifeOS API. Changes must protect user data,
maintain synchronization compatibility, and avoid exposing credentials or
personal tracking records.

## Development setup

Requirements:

- Node.js 18 or newer
- npm
- MongoDB Community Server or a MongoDB Atlas deployment

Install dependencies and configure the server:

```bash
npm ci
cp .env.example .env
npm run dev
```

Use development-only credentials. Never commit `.env`, database exports, JWTs,
connection strings containing passwords, or production user data.

## Making changes

- Validate every new request field at the API boundary.
- Scope every synchronized query and write to the authenticated `userId`.
- Use `syncId` as remote record identity; numeric IndexedDB IDs are local-only.
- Preserve deletion tombstones and server-generated pull watermarks.
- Update the client and server together when changing the sync contract.
- Add or migrate indexes deliberately, considering existing MongoDB documents.
- Do not log passwords, bearer tokens, JWT secrets, or MongoDB URIs.
- Keep rate limits and body-size limits appropriate for public endpoints.

## Verification

Before opening a pull request, run:

```bash
node --check index.js
node --check models.js
npm start
```

The repository does not yet have an automated test suite, so API changes also
require manual verification:

1. `GET /api/health` returns `200` with a connected database.
2. Registration validates input and duplicate email addresses.
3. Login rejects invalid credentials and returns an expiring JWT when valid.
4. Sync routes reject missing or invalid bearer tokens.
5. Push/pull round trips preserve UUID identities and category relationships.
6. Tombstones synchronize without restoring deleted records.
7. Records from one account cannot be read or changed by another account.

## Pull requests

Keep each pull request focused. Document API or schema changes, migration
requirements, security implications, and the checks performed. Link the
relevant issue when one exists.

By submitting a contribution, you agree that it may be distributed under the
GNU General Public License version 3.
