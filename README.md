# SWIM Protocol Simulator

Hackathon project demonstrating the SWIM (Scalable Weakly-consistent Infection-style Process Group Membership) protocol.

This repository currently ships **Page 1 (Overview / Guided Demo)** plus a FastAPI simulation backend. Live Simulator, Experiments, and How SWIM Works are routed placeholders. PostgreSQL is deferred until experiment persistence is needed.

## Architecture

```
React UI
  -> FastAPI REST endpoints for commands and snapshots
  -> FastAPI WebSockets for live events
  -> Python simulation engine
  -> PostgreSQL later for persistent experiment results
```

The simulation engine is independent of FastAPI route handlers and React components. All pages should share that engine.

## Requirements

- Python 3.11+
- Node.js 20+
- Two terminals (backend and frontend)

## Windows setup

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks script activation:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

API: [http://127.0.0.1:8000](http://127.0.0.1:8000)  
Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)  
Health: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)

### 2. Frontend

In a second terminal:

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

UI: [http://localhost:5173](http://localhost:5173)

`VITE_API_BASE_URL` defaults to `http://127.0.0.1:8000` when unset.

If port 8000 is already in use, start uvicorn with `--port 8001` and set `VITE_API_BASE_URL=http://127.0.0.1:8001` in `frontend/.env`.

## Tests and checks

Backend, from `backend/` with the virtualenv active:

```powershell
pytest
```

Frontend, from `frontend/`:

```powershell
npm run build
```

`npm run build` type-checks with `tsc -b` and then builds the production bundle.

## Honest scope

Milestone 1 implements a deterministic demo cluster, session creation, direct PING/ACK, timeouts, simplified suspicion/recovery, and local failure confirmation.

It does **not** implement indirect probes, incarnation precedence, gossip dissemination, convergence measurement, or experiment persistence. Restarting the backend resets in-memory sessions.

See `docs/architecture.md` and `docs/protocol-scope.md`.
