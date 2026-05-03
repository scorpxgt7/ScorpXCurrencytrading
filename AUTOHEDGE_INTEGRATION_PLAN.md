# AutoHedge Integration Plan for ScorpXGT7

## Goal

Integrate the useful parts of an AutoHedge-style autonomous hedge fund into ScorpXGT7 without breaking the current paper-first, static-safe design.

The correct target is:

- `index.html` remains the operator cockpit.
- `backend/server.js` becomes the orchestration layer and safe boundary for secrets, persistent state, and future venue adapters.
- Real broker execution stays locked until the backend has hard risk controls, audit logging, and authenticated practice-only adapters.

## Current ScorpXGT7 Baseline

The repo already contains pieces that overlap with AutoHedge:

- AI assistant tab with deterministic guidance and optional local Ollama
- paper trading account, open positions, and closed-trade tracking
- auto paper-trading scanner and executor
- performance and journal sync
- backend health, quote, indicators, journal, and placeholder backtest endpoints
- beta execution workspace for future backend-connected trading

This means the project does not need a greenfield rewrite. It needs extraction, centralization, and staged backend expansion.

## AutoHedge Feature Fit

### Safe to integrate now

- multi-agent analysis pipeline
- structured JSON outputs
- portfolio and risk orchestration
- detailed decision logs
- strategy ranking and thesis generation
- execution simulation
- venue abstraction for future practice adapters

### Should stay blocked for now

- direct wallet or broker execution from the frontend
- unattended live order routing
- storage of exchange secrets in `index.html`
- autonomous live trading without kill switch, exposure caps, and audit replay

## Target Architecture

### Frontend responsibilities

Keep in `index.html` or future frontend modules:

- tabs, controls, charts, forms, and operator guidance
- displaying agent outputs and execution logs
- paper-trade approval controls
- settings for thresholds, symbols, and backend URL
- manual override and pause controls

### Backend responsibilities

Build in `backend/server.js` first, then split into backend modules:

- market data normalization
- strategy thesis generation
- quant scoring and ranking
- risk checks and position sizing
- paper execution simulation
- portfolio state and exposure tracking
- audit/event logging
- broker adapter stubs

## Agent Model for ScorpXGT7

### 1. Director Agent

Purpose:

- select market regime
- prioritize symbols
- choose active strategy profile
- generate the current thesis

Suggested output:

```json
{
  "symbol": "EURUSD",
  "regime": "TREND",
  "strategyName": "Trend Scalper",
  "bias": "BUY",
  "confidence": 78,
  "thesis": [
    "HTF structure bullish",
    "Spread acceptable",
    "Momentum aligned"
  ],
  "nextAction": "send_to_quant"
}
```

### 2. Quant Agent

Purpose:

- compute indicators and multi-timeframe alignment
- reject low-quality setups
- rank setups across symbols
- produce transparent score breakdowns

This should absorb logic currently spread across the frontend strategy optimizer and signal engine.

Suggested output:

```json
{
  "symbol": "EURUSD",
  "signal": "BUY",
  "confidence": 82,
  "scoreBreakdown": {
    "emaAlignment": 20,
    "marketStructure": 20,
    "rsi": 15,
    "spread": 10,
    "rr": 10,
    "htfAlignment": 7
  },
  "rejectionReasons": [],
  "entry": 1.15234,
  "stopLoss": 1.15114,
  "takeProfit": 1.15474
}
```

### 3. Risk Agent

Purpose:

- validate max risk per trade
- validate max daily loss
- validate max open trades
- validate symbol concentration
- validate portfolio heat and correlated exposure
- size the position

This is the biggest missing piece between current ScorpX and AutoHedge-style operation.

Suggested output:

```json
{
  "approved": true,
  "riskDollars": 100,
  "riskPct": 1,
  "positionSizeUnits": 8300,
  "portfolioHeatPct": 2.3,
  "violations": [],
  "locks": {
    "dailyLossLock": false,
    "killSwitch": false
  }
}
```

### 4. Execution Agent

Purpose:

- convert approved trades into execution intents
- simulate fills, spread, and slippage
- track open order state
- later route to practice broker adapters

For ScorpXGT7 now, this agent should stay paper-only.

Suggested output:

```json
{
  "mode": "PAPER",
  "status": "FILLED",
  "symbol": "EURUSD",
  "side": "BUY",
  "filledPrice": 1.15239,
  "slippagePips": 0.5,
  "positionId": "paper-eurusd-001"
}
```

## Recommended API Surface

Add these endpoints on top of the existing backend:

- `GET /api/portfolio/state`
- `GET /api/audit/logs`
- `POST /api/agents/director/thesis`
- `POST /api/agents/quant/analyze`
- `POST /api/agents/risk/assess`
- `POST /api/agents/execution/simulate`
- `POST /api/agents/pipeline/run`
- `POST /api/controls/kill-switch`
- `POST /api/controls/pause-auto-trading`
- `GET /api/venues`

### Minimal contract for `/api/agents/pipeline/run`

Request:

```json
{
  "symbols": ["EURUSD", "GBPUSD", "XAUUSD"],
  "mode": "paper",
  "account": {
    "balance": 10000,
    "equity": 10025,
    "maxRiskPct": 1,
    "maxOpenTrades": 3
  }
}
```

Response:

```json
{
  "runId": "run-2026-05-04T10:00:00Z",
  "director": {},
  "rankedCandidates": [],
  "approvedTrade": null,
  "execution": null,
  "auditRefs": []
}
```

## Repo-Level Refactor Plan

### Phase 1: Centralize analysis and keep execution paper-only

Primary objective:
Move the current auto paper-trading intelligence out of `index.html` into backend-driven JSON flows while preserving behavior.

Work items:

- extract current strategy ranking rules into backend helper functions
- expose backend setup ranking endpoint
- expose backend paper execution simulation endpoint
- keep frontend rendering intact, but consume backend responses first
- keep existing browser-safe fallback logic in place

Files affected first:

- `backend/server.js`
- `index.html`
- optionally `backend/README.md`

Suggested backend module split after the first pass:

- `backend/lib/marketData.js`
- `backend/lib/quantEngine.js`
- `backend/lib/riskEngine.js`
- `backend/lib/paperExecution.js`
- `backend/lib/auditLog.js`

### Phase 2: Add true multi-agent orchestration

Primary objective:
Represent Director, Quant, Risk, and Execution as explicit stages with structured outputs and audit traces.

Work items:

- add pipeline orchestration endpoint
- persist run logs and decisions
- add portfolio state endpoint
- add daily lockout and kill switch state
- add replayable decision snapshots

Frontend additions:

- new `Agent Console` panel or tab
- new `Portfolio Risk` panel
- new `Execution Audit` panel

### Phase 3: Add venue abstraction and practice adapters

Primary objective:
Prepare the backend for broker integration without exposing secrets to the frontend.

Work items:

- add venue adapter interface
- add practice-only adapter first
- add order-intent approval mode
- add fill reconciliation and retry rules
- add explicit environment-based credentials handling

Suggested adapter shape:

```js
{
  id: 'oanda-practice',
  mode: 'practice',
  capabilities: ['quotes', 'orders', 'positions'],
  enabled: false
}
```

### Phase 4: Controlled autonomy

Primary objective:
Allow semi-autonomous or autonomous practice execution only after controls exist.

Required controls before enabling:

- kill switch
- daily drawdown lock
- max concurrent trades
- per-symbol exposure cap
- correlated exposure cap
- audit trail with decision replay
- operator pause/resume
- backend auth for control endpoints

## Exact Current Logic to Migrate First

The best first extraction targets are the existing frontend functions that already behave like pre-agent components:

- `executeAutoPaperTrade`
- `updateAutoTradeMonitor`
- `executePaperTrade`
- `renderPaperTradingDashboard`
- `calculatePaperPnl`
- `calculatePips`
- `getPipSize`

Migration rule:

- pure calculations move to backend/shared helpers first
- DOM rendering stays frontend
- trade approval state should come from backend responses where available

## UI Plan

Keep the current tabs. Add capability panels instead of replacing the current flow.

### Recommended additions

- `Agent Console`
  - current thesis
  - ranked opportunities
  - stage-by-stage pass/fail status
- `Portfolio Risk`
  - portfolio heat
  - symbol exposure
  - daily loss state
  - lock flags
- `Execution Audit`
  - pending intents
  - fills
  - rejections
  - simulated venue responses
- `Venue Manager`
  - available adapters
  - mode: disabled, simulated, practice

The `live-auto-beta` tab should become the main landing area for these controls instead of pretending to be a finished live-trading page.

## Data and Persistence Plan

Current persistence is split between `localStorage` and SQLite-backed journal storage.

Recommended direction:

- keep local UI preferences in `localStorage`
- keep trade journal, pipeline runs, audit logs, and control state in backend storage
- add SQLite tables for:
  - `agent_runs`
  - `agent_events`
  - `risk_locks`
  - `execution_intents`
  - `venue_adapters`

## Security and Safety Rules

Non-negotiable boundaries:

- no API secrets in `index.html`
- no direct venue credentials in the browser
- no live autonomous execution in GitHub Pages mode
- no broker order endpoint without backend auth and risk locks
- no autonomous mode without replayable logs

## Recommended Delivery Order for This Repo

### Step 1

Refactor `backend/server.js` into named analysis, risk, and execution helpers without changing UI behavior.

### Step 2

Add `/api/agents/quant/analyze` and `/api/agents/execution/simulate`, then switch current auto paper-trade flow to consume them when backend is enabled.

### Step 3

Add `/api/agents/risk/assess` and portfolio lock rules, then surface those states in the beta tab.

### Step 4

Add `/api/agents/pipeline/run` and a visible audit stream in the UI.

### Step 5

Introduce venue adapters for practice mode only after the above is stable.

## Recommendation

If the objective is “same functions and feature” as AutoHedge, the closest correct ScorpXGT7 version is:

- AutoHedge-style backend orchestration
- ScorpX-style frontend cockpit
- paper-first simulation by default
- practice adapter second
- live autonomy last

Anything more aggressive would overload the current single-page app and weaken the safety boundary that the repo already establishes.
