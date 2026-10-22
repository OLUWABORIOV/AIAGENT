# Deploying Stillwork for public use

This app has three moving parts:

| Part | What it does | Where it runs |
| --- | --- | --- |
| React dashboard | The pages your boss opens | **Vercel** |
| FastAPI API | Accepts jobs and returns results | **Render** |
| Worker + Redis | Runs Gemini jobs in the background | **Inside the Render API service** + Redis |

The worker and Redis cannot run on Vercel. Vercel functions are short-lived, and
a Gemini job can take 30-120 seconds. Vercel hosts the dashboard and a small
server-side proxy; the API and worker run on Render.

```
Browser
  │  https://your-app.vercel.app
  ▼
Vercel dashboard + /api proxy (password protected)
  │  adds X-API-Key on the server
  ▼
Render web service (FastAPI + inline arq worker)
  │
  └── Redis (Render Key Value or Upstash)
```

For a first deployment, the Render service runs **both** the API and the worker
in one process. That keeps it on Render's free web tier. When traffic grows,
split them into a web service and a background worker by setting
`RUN_INLINE_WORKER=false`.

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

## Step 1 - Fix the Render service

The existing Render web service is the API. It is a **Python 3** service on the
**Free** plan.

In Render, open the service and go to **Settings**:

| Setting | Value |
| --- | --- |
| Root Directory | `agent_service` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `bash start.sh` |
| Health Check Path | `/health` |

If you leave Root Directory empty, use:

| Setting | Value |
| --- | --- |
| Build Command | `pip install -r agent_service/requirements.txt` |
| Start Command | `bash start.sh` |

The repository includes both `agent_service/requirements.txt` and a root
`start.sh` so either layout works.

Add or update these environment variables on the Render service:

| Variable | Value |
| --- | --- |
| `REDIS_URL` | Redis connection URL |
| `GEMINI_API_KEY` | Your Gemini key |
| `API_KEYS` | The long random backend key you generated |
| `GEMINI_MODEL` | `gemini-3.5-flash` |
| `RUN_INLINE_WORKER` | `true` |
| `PYTHON_VERSION` | `3.12.0` |

`RUN_INLINE_WORKER=true` is what makes the free single-service setup work: the
arq worker starts inside the FastAPI process and processes jobs while the web
service is awake.

### Redis

Use one of these:

- **Render Key Value** in the same region as the web service. Copy the
  **Internal Redis URL** into `REDIS_URL`.
- **Upstash Redis** free tier. Copy the TLS URL (`rediss://...`) into
  `REDIS_URL`.

If you use Render Key Value, make sure both services are in the same region.

Then click **Manual Deploy > Clear build cache & deploy**.

Check the logs. A healthy deploy ends with something like:

```
Redis connected
Inline arq worker started
Uvicorn running on http://0.0.0.0:10000
```

Open:

```
https://agent-service-backend.onrender.com/health
```

Expected:

```json
{"status":"ok","version":"0.1.0","redis":"ok"}
```

If the URL returns `404` with `x-render-routing: no-server`, the deploy did not
produce a running server. Open the Render **Logs** tab and fix the build or start
error shown there.

> Render's free web service sleeps after inactivity. The first request can take
> 30-60 seconds while it wakes. For a smoother boss demo, upgrade the web
> service to Starter. The inline worker is still fine.

## Step 2 - Deploy the dashboard on Vercel

The current Vercel project is **not connected to Git** yet. You can either use
the dashboard or the CLI.

### Option A - Connect Git in the Vercel dashboard

1. In Vercel, open the `agent-dashboard` project.
2. Click **Connect Git** and select the `OLUWABORIOV/AIAGENT` repository.
3. Set **Root Directory** to `agent_dashboard`.
4. Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
5. Add these Production environment variables:

| Variable | Value |
| --- | --- |
| `BACKEND_URL` | `https://agent-service-backend.onrender.com` (no trailing slash) |
| `BACKEND_API_KEY` | Same value as Render `API_KEYS` |
| `APP_PASSWORD` | The password you want your boss to enter |
| `SESSION_SECRET` | The long random session secret you generated |

Do **not** set `VITE_API_URL` or `VITE_API_KEY`.

6. Deploy.

### Option B - Deploy from this computer with the CLI

```powershell
cd C:\Users\dell\OneDrive\Desktop\AIAGENT\agent_dashboard
vercel login
vercel --prod
```

If Vercel asks for the project, choose the existing `agent-dashboard` project.
Set the same environment variables in **Project Settings > Environment
Variables** before deploying.

## Step 3 - Verify end to end

1. Open the Vercel URL.
2. Sign in with `APP_PASSWORD`.
3. The dashboard should show **Agent connected**.
4. Submit: `What is 2 + 2? Reply with just the number.`
5. The job should move from `queued` to `running` to `completed` with `4`.

If the job stays `queued`, the API and worker are not using the same Redis, or
`RUN_INLINE_WORKER` is not `true`.

## Security notes

- The login is cookie-based. `SESSION_SECRET` signs the cookie; rotating it
  signs everyone out.
- `APP_PASSWORD` is the only password your boss needs. Share it privately.
- The frontend source and static files are public. Only the API is protected.
  Do not put documents, keys, or secrets in frontend code.
- Use a different `API_KEYS` value from `dev-key-123`.
- Keep `GEMINI_API_KEY` only in Render. The Vercel project only needs the proxy
  key.
- Revoke the old committed Gemini key in Google AI Studio.

## Cost expectation

- Vercel Hobby: free for this dashboard.
- Render web service: Free, but it sleeps when idle.
- Redis: Render Key Value or Upstash free tier.
- Gemini: pay per token.

For reliable, always-on use, upgrade the Render web service to Starter (about
$7/month). Later, if traffic grows, split the worker into its own paid service:

1. Set `RUN_INLINE_WORKER=false` on the web service.
2. Add a Render background worker using the same repository and `agent_service`
   root.
3. Start command: `python -m arq app.worker.WorkerSettings`.
4. Set `REDIS_URL` and `GEMINI_API_KEY` on the worker too.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Render deploy fails in under 2 minutes | Build command and Root Directory; open the build logs |
| `/health` returns 404 `no-server` | The deploy failed, so no server is running |
| `/health` returns `degraded` | `REDIS_URL` is wrong or Redis is asleep |
| Dashboard says "Agent offline" | `BACKEND_URL` is correct and Render `/health` returns 200 |
| Login says "Authentication is not configured" | `APP_PASSWORD` and `SESSION_SECRET` are set in Vercel |
| Login succeeds but every API call returns 401 | `BACKEND_API_KEY` in Vercel must match Render `API_KEYS` |
| Jobs stay `queued` | `RUN_INLINE_WORKER=true` and API/worker share the same `REDIS_URL` |
| Jobs fail with 503 | Gemini capacity; retry, or change `GEMINI_MODEL` to a working model |
| CORS errors | You are calling the Render URL directly; use the Vercel `/api` proxy |

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
local API. The production build uses the Vercel function and the password gate.
