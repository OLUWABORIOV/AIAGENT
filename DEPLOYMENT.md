# Deploying Stillwork for public use

This app has three moving parts:

| Part | What it does | Where it should run |
| --- | --- | --- |
| React dashboard | The pages your boss opens | **Vercel** |
| FastAPI API | Accepts jobs and returns results | **Render** (Docker web service) |
| arq worker + Redis | Runs Gemini jobs in the background | **Render** (Docker worker + Key Value) |

The worker and Redis cannot run on Vercel. Vercel functions are short-lived, and
a Gemini job can take 30-120 seconds. Vercel hosts the dashboard and a small
server-side proxy; the API and worker run on Render.

```
Browser
  │  https://your-app.vercel.app
  ▼
Vercel static dashboard + /api proxy (password protected)
  │  adds X-API-Key on the server
  ▼
Render API  ──────►  Render Redis  ◄──────  Render worker
  (enqueue only)                              (Gemini, 30-120s)
```

## Before you start

1. Push this repository to GitHub. The current branch is `master`.
2. Create a [Render](https://render.com) account.
3. Create a [Vercel](https://vercel.com) account linked to the same GitHub.
4. Have a Gemini API key ready.
5. **Rotate the old Gemini key** if it was ever committed. Never put the Gemini
   key in Vercel or in the frontend.

Generate strong values for the backend key and the session secret:

```powershell
# Backend API key (goes in Render API_KEYS and Vercel BACKEND_API_KEY)
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()

# Session signing secret (goes only in Vercel SESSION_SECRET)
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

## Step 1 - Deploy the backend on Render

The repository includes `render.yaml` at the root. It defines:

- `stillwork-api` - Docker web service, 1 Starter instance, Frankfurt
- `stillwork-worker` - Docker worker, 1 Starter instance, Frankfurt

1. In Render, choose **New > Blueprint**.
2. Connect the GitHub repository.
3. Render reads `render.yaml` and asks for the values marked `sync: false`.
4. Create the Redis instance first: **New > Key Value**, choose the **Frankfurt**
   region and the smallest plan. Copy its **Internal Redis URL**.
5. Fill in the Render environment variables:

| Variable | Value |
| --- | --- |
| `REDIS_URL` | Internal Redis URL from step 4 |
| `GEMINI_API_KEY` | Your Gemini key |
| `API_KEYS` | The long random backend key you generated |
| `GEMINI_MODEL` | `gemini-3.5-flash` (already set in the blueprint) |

`API_KEYS` only needs to be on the **web** service. The worker gets
`REDIS_URL` and `GEMINI_API_KEY`.

6. Deploy both services. Wait for the API to become live.
7. Open `https://<your-api>.onrender.com/health`. You should see:

```json
{"status":"ok","version":"0.1.0","redis":"ok"}
```

If Redis is unreachable, the status is `degraded`; check that both services use
the same region and the internal Redis URL.

> Render's free web services sleep after inactivity. For a boss demo, use the
> Starter plan so the first request is fast. The worker requires a paid
> instance; there is no free background-worker tier.

## Step 2 - Deploy the dashboard on Vercel

1. In Vercel, choose **Add New > Project** and import the repository.
2. Set **Root Directory** to `agent_dashboard`.
3. Framework preset: **Vite**. Build command: `npm run build`. Output: `dist`.
4. Add these Production environment variables:

| Variable | Value |
| --- | --- |
| `BACKEND_URL` | `https://<your-api>.onrender.com` (no trailing slash) |
| `BACKEND_API_KEY` | Same value as Render `API_KEYS` |
| `APP_PASSWORD` | The password you want your boss to enter |
| `SESSION_SECRET` | The long random session secret you generated |

Do **not** set `VITE_API_URL` or `VITE_API_KEY`. The frontend calls `/api/*`
on the same Vercel domain; the serverless proxy adds the backend key. This keeps
the key out of the browser.

5. Deploy. Open the Vercel URL and sign in with `APP_PASSWORD`.

## Step 3 - Verify end to end

1. The dashboard should show **Agent connected**.
2. Submit: `What is 2 + 2? Reply with just the number.`
3. The job should move from `queued` to `running` to `completed` with `4`.
4. If it stays `queued`, the worker is not connected to the same Redis as the API.
5. If it fails with `503`, Gemini is temporarily overloaded; retry. The worker
   already retries transient 503/429 errors three times.

## Security notes

- The login is cookie-based. `SESSION_SECRET` signs the cookie; rotating it
  signs everyone out.
- `APP_PASSWORD` is the only password your boss needs. Share it over a private
  channel, not in the same message as the URL if you can avoid it.
- The frontend source and static files are public. Only the API is protected.
  Do not put documents, keys, or secrets in frontend code.
- Use a different `API_KEYS` value from `dev-key-123`.
- Keep `GEMINI_API_KEY` only in Render. The Vercel project only needs the proxy
  key.
- The old committed Gemini key should be revoked in Google AI Studio.

## Cost expectation

- Vercel Hobby: free for this dashboard.
- Render API Starter: about $7/month.
- Render worker Starter: about $7/month.
- Render Key Value: small instance, roughly $10/month or the smallest available.
- Gemini usage: pay per token.

If that is too much for a first demo, deploy the API and worker on one small VPS
with Docker Compose instead, and keep only the frontend on Vercel. The Vercel
proxy still works; just set `BACKEND_URL` to the VPS HTTPS URL.

## Local development after these changes

The frontend no longer contains an API key. Local development uses Vite's dev
proxy, which adds the key server-side.

```powershell
cd agent_dashboard
Copy-Item .env.example .env.local
# .env.local should contain BACKEND_URL and BACKEND_API_KEY
npm run dev
```

The backend must have the same key in `agent_service/.env` (`API_KEYS`). In
development the login gate is bypassed because Vite proxies directly to the
local API. The production build (`npm run build`) uses the Vercel function and
the password gate.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Dashboard says "Agent offline" | `BACKEND_URL` is correct and Render `/health` returns 200 |
| Login says "Authentication is not configured" | `APP_PASSWORD` and `SESSION_SECRET` are set in Vercel |
| Login succeeds but every API call returns 401 | `BACKEND_API_KEY` in Vercel must match Render `API_KEYS` |
| Jobs stay `queued` | API and worker must use the same `REDIS_URL`; worker logs should show Redis 7.x |
| Jobs fail with 503 | Gemini capacity; retry, or change `GEMINI_MODEL` to a working model |
| CORS errors | You are calling the Render URL directly; use the Vercel `/api` proxy |
