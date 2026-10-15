# Agent Dashboard

This folder contains the Stillwork frontend. The FastAPI API, Redis queue, and
workers live separately in `../agent_service`.

## Run locally

1. Start the backend from `../agent_service` using its README instructions.
   The API should be available at `http://127.0.0.1:8000`.
2. In a separate terminal, start this frontend:

   ```powershell
   cd agent_dashboard
   npm install
   npm run dev
   ```

3. Open `http://localhost:3000`.

Vite forwards `/health` and `/v1/*` requests to the backend on port 8000. The
backend's configured `API_KEYS` must include the development key used by the
frontend (`dev-key-123`). Keep real API credentials in the backend's local
environment, never in frontend source.

## Build and deployment

Run `npm run build` to create the production frontend in `dist/`. For a
separately hosted backend, set `VITE_API_URL` to its public base URL in the
frontend build environment, for example `https://api.example.com`. The browser
uses that URL directly instead of Vite's local development proxy. The backend
must allow requests from the deployed frontend origin.

The dashboard theme and responsive layout are in `src/index.css`; the custom
transparent agent emblem is in `public/agent-mark.png`. Both ship with the
frontend build.

Submitted tasks are saved in the browser tab's `sessionStorage`, so history
survives a refresh and unfinished tasks resume polling. The browser-tab history
is cleared when its tab session ends. The backend currently retains individual
job results for a limited time and exposes an active-job count rather than a
persistent all-jobs history endpoint; expired results are shown as unavailable.
