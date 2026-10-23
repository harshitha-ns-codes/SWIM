# Architecture

The SWIM simulator is split into a React UI and a FastAPI backend. Protocol behavior lives in a Python simulation engine that neither the route handlers nor the React components own.

```
React UI
  -> FastAPI REST endpoints for commands and snapshots
  -> FastAPI WebSockets for live events
  -> Python simulation engine
  -> PostgreSQL later for persistent experiment results
```

## Frontend

`frontend/` is a Vite + React + TypeScript app. It talks to the backend through `src/services/api.ts` and `src/services/websocket.ts`. Pages must not contain a second copy of SWIM logic.

Current routes:

- `/` Overview / guided demo
- `/simulator` Live Simulator placeholder
- `/experiments` Experiments placeholder
- `/how-it-works` How SWIM Works placeholder

## Backend

`backend/app/simulation/` is the engine. `backend/app/services/session_manager.py` holds in-memory sessions. `backend/app/api/routes/` exposes HTTP and WebSocket contracts.

Sessions are process-local. Restarting the backend drops them. PostgreSQL is deferred until experiment persistence is useful.

## Shared engine rule

Live Simulator, Experiments, and How SWIM Works must call the same `SimulationEngine` / `SessionManager` path. Do not implement protocol behavior in page components.
