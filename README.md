# Polyester Titan AI

Polyester Titan AI is a React, Vite, and Express trading terminal for Polyester
testnet market data and guarded order lifecycle experiments. API credentials
remain on the server and are never intended for frontend configuration.

## Requirements

- Node.js 22.12 or newer
- Bun 1.3 or newer (recommended; uses the checked-in `bun.lock`) or npm 10+

## Local setup

In PowerShell:

```powershell
bun install
Copy-Item .env.example .env
```

Edit `.env` with your own **testnet** credentials. Do not put credentials in
`.env.example`, frontend files, or source control. Start the local app with:

```powershell
bun run dev
```

The server binds to `127.0.0.1` by default. The API does not implement user
authentication; do not expose it to a network or public reverse proxy without
adding an authentication layer and TLS protection.

## Safety defaults

- `BOT_DRY_RUN=true`
- `BOT_AUTO_TRADE_ENABLED=false`
- Live execution adapter disabled by default
- Polyester API requests restricted to the exact testnet host allowlist
- External withdrawals should remain disabled on the API key
- Direct Phase 21E order submission and Phase 21G exchange cancellation are
  blocked while dry-run is enabled
- Ambiguous order submission and unconfirmed cancellation outcomes require
  reconciliation; a lookup miss alone is not permission to retry

Do not change these safeguards just to make a smoke test pass. Read-only smoke
checks may use `/api/health/local`, `/api/health`, `/api/markets`,
`/api/orders`, and `/api/strategy/status`. Do not call order mutation endpoints
unless explicitly conducting an approved testnet operation.

## Validation

```powershell
npm run lint
npm test
npm run build
```

The equivalent Bun commands are:

```powershell
bun run lint
bun test
bun run build
```

For npm users, install with:

```powershell
npm install
```

## Phase development

- Keep phase-specific behavior behind explicit guards and use the shared
  testnet host validator before upstream calls.
- Keep API credentials in server-only environment variables; response and log
  payloads must not contain private keys or full credential material.
- Exercise order submission, cancellation, retries, and reconciliation with
  mock adapters in tests. Never submit real orders as part of automated tests.
- Preserve dry-run, auto-trade, withdrawal, kill-switch, approval, notional,
  and position safeguards when adding endpoints or UI actions.
- Update focused tests and this document when the safety or runtime workflow
  changes.
