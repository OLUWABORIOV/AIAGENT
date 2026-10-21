# Agent Dashboard

This folder contains the Stillwork frontend. The FastAPI API, Redis queue, and
workers live separately in `../agent_service`.

## Run locally

1. Start the backend from `../agent_service` using its README instructions.
   The API should be available at `http://127.0.0.1:8000`.
2. Copy the local environment file:

   ```powershell
   cd agent_dashboard
   Copy-Item .env.example .env.local
   ```

3. Start the frontend:

   ```powershell
   npm install
   npm run dev
   ```

4. Open `http://localhost:3000`.

Vite forwards `/api/*` to the backend and adds `BACKEND_API_KEY` on the server.
The key is never included in the browser bundle. The backend's `API_KEYS` must
contain the same value. Local development bypasses the login gate; production
uses it.

`.env.local` is gitignored. Keep real credentials out of `src/`.

## Production deployment

The frontend is deployed on Vercel. Vercel also runs the `/api` serverless proxy,
which:

- checks the signed `stillwork_session` cookie
- adds `X-API-Key` server-side
- forwards requests to the Render API

Set these Vercel environment variables:

| Variable | Purpose |
| --- | --- |
| `BACKEND_URL` | Public Render API URL, no trailing slash |
| `BACKEND_API_KEY` | Must match the backend `API_KEYS` |
| `APP_PASSWORD` | Password used on the sign-in screen |
| `SESSION_SECRET` | Long random value used to sign session cookies |

Do not set `VITE_API_URL` or `VITE_API_KEY` in production.

See `../DEPLOYMENT.md` for the full backend + frontend runbook.

## Build

```powershell
npm run build
```

The production build is written to `dist/`. The build contains no backend key;
the Vercel functions add it at request time.

## How it fits together

```
Browser -> Vercel dashboard + /api proxy -> Render API -> Redis <- Render worker
```

There is no long-running work in Vercel: submit requests only enqueue a job, and
the browser polls for the result. The Gemini call runs in the Render worker,
where a 30-120 second job is fine.
