# ScorpXGT Local Backend

This backend is the safe bridge between the static trading app and services that require secrets or local storage.

It provides:

- Market quotes through Twelve Data, Alpha Vantage, exchangerate-api fallback, then simulated paper data.
- Derived technical indicator fields that match the existing frontend data model.
- SQLite-backed trade journal storage.
- Placeholder news and backtest endpoints ready for server-side integrations.
- No broker execution endpoints. Paper mode and manual approval remain the default boundary.

## Run

From the repo root:

```powershell
npm run backend
```

or:

```powershell
node backend/server.js
```

Open the app through the backend:

```text
http://127.0.0.1:8000
```

## Optional API Keys

Set API keys in your shell before starting the backend. Do not put real keys into `index.html` or GitHub Pages.

```powershell
$env:TWELVE_DATA_API_KEY="your_key_here"
$env:ALPHAVANTAGE_API_KEY="your_key_here"
$env:SCORPX_BACKEND_PORT="8000"
node backend/server.js
```

`backend/.env.example` is only a reference file. The current backend uses environment variables directly and does not require any npm dependencies.

## Endpoints

- `GET /api/health`
- `GET /api/quotes/EURUSD`
- `GET /api/indicators/EURUSD`
- `GET /api/news?query=forex`
- `GET /api/journal`
- `POST /api/journal`
- `DELETE /api/journal`
- `GET /api/audit/logs`
- `GET /api/pipeline/runs`
- `GET /api/pipeline/runs/:id`
- `POST /api/agents/quant/analyze`
- `POST /api/agents/risk/assess`
- `POST /api/agents/execution/simulate`
- `POST /api/agents/pipeline/run`
- `GET /api/portfolio/state`
- `POST /api/backtest`

All endpoints are read-first or paper-storage only. Future broker integrations should stay behind separate authenticated endpoints with read-only permissions first and explicit manual approval before any order.
