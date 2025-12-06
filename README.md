# Ace Trade – Trade Terminal

Secure Solana meme coin execution surface that complements the `a-trade-landing` experience. This app validates Telegram one-time session tokens, promotes them into persistent JWT sessions, and will eventually host the full PumpFun trading interface.

## Stack

- **Next.js 16 / React 19** using the App Router
- **Tailwind CSS 3.4** with a retro terminal theme
- **PostgreSQL** via the shared `ace_trade_auth` database
- **Zod** for runtime validation
- **jsonwebtoken** for issuing persistent session tokens

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server on `http://localhost:3000` |
| `npm run build` | Production build |
| `npm start` | Serve the built app on port 3000 |
| `npm run lint` | Lint all TypeScript/React files |

## Environment Variables

Copy `.env.example` to `.env` inside `trade-terminal/` and update the values as needed:

```bash
cp .env.example .env
```

Key variables:

- `DB_*` – connection settings for `ace_trade_auth`
- `JWT_SECRET`, `JWT_EXPIRY_DAYS` – signing key + lifetime for persistent sessions
- `MAX_ACTIVE_SESSIONS_PER_USER`, `MAX_TABS_PER_USER` – enforce device limits
- `WS_URL` – WebSocket auth gateway (stubbed locally to `ws://localhost:8080/ws`)

## Auth Flow (Current Scope)

1. Telegram bot issues a `?token=<uuid>` link with a 5‑minute expiry.
2. `/auth/login` page captures the token and calls `POST /api/auth/validate-session`.
3. The API validates the one-time token inside PostgreSQL, burns it, creates a JWT, logs the event, and enforces device limits.
4. The response now sets an HTTP‑only `ace_trade_session` cookie (no JWT in `localStorage`) and returns supporting metadata (user, websocket URL).
5. The login page only caches the WebSocket URL, then redirects to `/terminal`, which verifies the cookie server-side before rendering.
6. Authenticated APIs (sessions management, PIN setup/verify) require the cookie and log all actions to `security_logs` with rate limits applied to sensitive endpoints.

## Directory Notes

```
trade-terminal/
├── src/app/
│   ├── page.tsx                      # Landing page (redirects to /terminal when session cookie exists)
│   ├── terminal/page.tsx             # Server-protected workspace (checks cookie)
│   ├── auth/login/page.tsx           # Token exchange UI
│   └── api/auth/
│       ├── validate-session/route.ts # POST → promote one-time token + set cookie
│       ├── sessions/route.ts         # GET → list active sessions
│       ├── sessions/[sessionId]/route.ts # DELETE → revoke active session
│       ├── setup-pin/route.ts        # POST → create/update trading PIN
│       └── verify-pin/route.ts       # POST → verify trading PIN with rate limiting
├── src/components/
│   ├── auth/SessionExchange.tsx      # Client component handling fetch + UX states
│   └── landing/LandingPage.tsx       # Imported landing experience from a-trade-landing
├── src/config/serverEnv.ts           # Strongly-typed env loader (zod)
├── src/lib/
│   ├── auth/                         # Auth helpers (promoteSession, cookies, session, pin, requireSession)
│   ├── rateLimit/inMemory.ts         # Simple in-memory limiter for sensitive endpoints
│   ├── security/log.ts               # Security event logging helper
│   ├── db.ts                         # PG pool helpers
│   ├── errors.ts                     # Lightweight HttpError
│   └── jwt.ts                        # JWT helper
├── tailwind.config.ts                # Retro terminal theme tokens
└── .env.example                      # Required vars for local runs
```

## Development Checklist

- Run `npm install` inside `trade-terminal/` after pulling changes.
- Start PostgreSQL (same instance used by `database/` + `tg-auth-service`).
- Ensure the Telegram bot is online to mint session links.
- Run `npm run dev` and navigate to `http://localhost:3000/auth/login?token=<uuid>` from the bot.
- Keep `npm run lint` clean before handing off or committing.

Future phases will add the WebSocket auth mesh, actual trading workspaces, and Solana transaction orchestration. For now, this repo gives us a styled shell plus the first auth endpoint required to bridge Telegram → terminal.
