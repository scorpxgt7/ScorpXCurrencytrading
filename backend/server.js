const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SCORPX_BACKEND_PORT || 8000);
const DB_PATH = process.env.SCORPX_DB_PATH || path.join(ROOT, 'scorpx-trading-journal.db');
const ALPHA_VANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY || '';
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || '';
const memoryAuditEvents = [];
const memoryPipelineRuns = [];

const symbols = {
  EURUSD: { pair: 'EUR/USD', base: 'EUR', quote: 'USD', decimal: 5, yahoo: 'EURUSD=X' },
  GBPUSD: { pair: 'GBP/USD', base: 'GBP', quote: 'USD', decimal: 5, yahoo: 'GBPUSD=X' },
  USDJPY: { pair: 'USD/JPY', base: 'USD', quote: 'JPY', decimal: 3, yahoo: 'JPY=X' },
  AUDUSD: { pair: 'AUD/USD', base: 'AUD', quote: 'USD', decimal: 5, yahoo: 'AUDUSD=X' },
  USDCAD: { pair: 'USD/CAD', base: 'USD', quote: 'CAD', decimal: 5, yahoo: 'CAD=X' },
  USDCHF: { pair: 'USD/CHF', base: 'USD', quote: 'CHF', decimal: 5, yahoo: 'CHF=X' },
  XAUUSD: { pair: 'XAU/USD', base: 'XAU', quote: 'USD', decimal: 2, yahoo: 'GC=F' },
};

const defaultStrategyProfiles = [
  { id: 'trend-scalper', name: 'Trend Scalper', stopAtr: 1.1, targetAtr: 2.0, minRR: 1.6, confidenceBoost: 4 },
  { id: 'momentum-breakout', name: 'Momentum Breakout', stopAtr: 1.3, targetAtr: 2.7, minRR: 1.8, confidenceBoost: 8 },
  { id: 'balanced-swing', name: 'Balanced Swing', stopAtr: 1.6, targetAtr: 3.0, minRR: 1.7, confidenceBoost: 2 },
  { id: 'gold-conservative', name: 'Gold Conservative', stopAtr: 1.8, targetAtr: 3.8, minRR: 2.0, confidenceBoost: 6 },
];

function send(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function pipSize(symbol) {
  return symbol === 'XAUUSD' || symbol.includes('JPY') ? 0.01 : 0.0001;
}

function asNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function withDerivedFields(symbol, price, provider, previous = price) {
  const meta = symbols[symbol] || symbols.EURUSD;
  const halfSpread = pipSize(symbol) * (symbol === 'XAUUSD' ? 18 : 0.6);
  const bid = price - halfSpread;
  const ask = price + halfSpread;
  const change = price - previous;
  const volatility = Math.max(Math.abs(change), pipSize(symbol) * (symbol === 'XAUUSD' ? 80 : 12));
  const ema20 = price - change * 0.35;
  const ema50 = price - change * 0.75;
  const rsi14 = Math.max(20, Math.min(80, 50 + (change / volatility) * 18));
  const atr14 = Math.max(pipSize(symbol) * 8, volatility * 1.8);
  const marketStructure = ema20 > ema50 ? 'BULLISH' : ema20 < ema50 ? 'BEARISH' : 'RANGE';
  return {
    symbol,
    price,
    bid,
    ask,
    spread: Math.abs(ask - bid) / pipSize(symbol),
    change,
    decimal: meta.decimal,
    dataType: provider,
    provider,
    ema20,
    ema50,
    rsi14,
    atr14,
    lastSwingHigh: price + atr14 * 1.6,
    lastSwingLow: price - atr14 * 1.6,
    marketStructure,
    htfStructure: marketStructure,
    htfEma20: ema20,
    htfEma50: ema50,
    maxSpreadAllowed: symbol === 'USDJPY' || symbol === 'XAUUSD' ? 3 : 2.5,
    newsRisk: 'LOW',
    timestamp: new Date().toISOString(),
  };
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function quoteFromTwelveData(symbol) {
  if (!TWELVE_DATA_API_KEY) throw new Error('TWELVE_DATA_API_KEY is not configured');
  const meta = symbols[symbol];
  const url = new URL('https://api.twelvedata.com/quote');
  url.searchParams.set('symbol', meta.pair);
  url.searchParams.set('apikey', TWELVE_DATA_API_KEY);
  const data = await fetchJson(url);
  const price = Number(data.close || data.price);
  const previous = Number(data.previous_close || data.open || price);
  if (!Number.isFinite(price)) throw new Error(data.message || 'Twelve Data returned no price');
  return withDerivedFields(symbol, price, 'TWELVE_DATA', previous);
}

async function quoteFromAlphaVantage(symbol) {
  if (!ALPHA_VANTAGE_API_KEY) throw new Error('ALPHAVANTAGE_API_KEY is not configured');
  const meta = symbols[symbol];
  if (symbol === 'XAUUSD') throw new Error('Alpha fallback skips XAUUSD spot in this backend');
  const url = new URL('https://www.alphavantage.co/query');
  url.searchParams.set('function', 'CURRENCY_EXCHANGE_RATE');
  url.searchParams.set('from_currency', meta.base);
  url.searchParams.set('to_currency', meta.quote);
  url.searchParams.set('apikey', ALPHA_VANTAGE_API_KEY);
  const data = await fetchJson(url);
  const rate = data['Realtime Currency Exchange Rate'];
  const price = Number(rate?.['5. Exchange Rate']);
  if (!Number.isFinite(price)) throw new Error(data.Note || data.Information || 'Alpha Vantage returned no price');
  return withDerivedFields(symbol, price, 'ALPHA_VANTAGE', price);
}

async function quoteFromExchangeRate(symbol) {
  const meta = symbols[symbol];
  if (symbol === 'XAUUSD') return simulatedQuote(symbol, 'SIM_XAU_FALLBACK');
  const data = await fetchJson(`https://api.exchangerate-api.com/v4/latest/${meta.base}?base=${meta.base}`);
  const price = Number(data.rates?.[meta.quote]);
  if (!Number.isFinite(price)) throw new Error('ExchangeRate API returned no price');
  return withDerivedFields(symbol, price, 'EXCHANGERATE_API', price);
}

function simulatedQuote(symbol, provider = 'SIMULATED_BACKEND') {
  const baselines = {
    EURUSD: 1.14996,
    GBPUSD: 1.27456,
    USDJPY: 147.892,
    AUDUSD: 0.65892,
    USDCAD: 1.34987,
    USDCHF: 0.88456,
    XAUUSD: 2025.67,
  };
  const base = baselines[symbol] || baselines.EURUSD;
  const move = (Math.random() - 0.5) * pipSize(symbol) * (symbol === 'XAUUSD' ? 120 : 20);
  return withDerivedFields(symbol, base + move, provider, base);
}

async function getQuote(symbol) {
  const normalized = String(symbol || 'EURUSD').toUpperCase();
  if (!symbols[normalized]) throw new Error(`Unsupported symbol: ${symbol}`);
  const attempts = [quoteFromTwelveData, quoteFromAlphaVantage, quoteFromExchangeRate];
  const errors = [];
  for (const attempt of attempts) {
    try {
      return await attempt(normalized);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { ...simulatedQuote(normalized), warnings: errors };
}

function normalizeQuote(symbol, quote = {}) {
  const normalized = String(symbol || quote.symbol || 'EURUSD').toUpperCase();
  const meta = symbols[normalized];
  if (!meta) throw new Error(`Unsupported symbol: ${symbol}`);

  const price = asNumber(quote.price, NaN);
  if (!Number.isFinite(price)) throw new Error(`Missing price for ${normalized}`);

  const bid = asNumber(quote.bid, price - pipSize(normalized) * 0.6);
  const ask = asNumber(quote.ask, price + pipSize(normalized) * 0.6);
  const spread = Number.isFinite(asNumber(quote.spread, NaN))
    ? asNumber(quote.spread)
    : Math.abs(ask - bid) / pipSize(normalized);
  const atr14 = Math.max(asNumber(quote.atr14, pipSize(normalized) * 8), pipSize(normalized) * 8);

  return {
    symbol: normalized,
    price,
    bid,
    ask,
    spread,
    decimal: Number.isFinite(asNumber(quote.decimal, NaN)) ? asNumber(quote.decimal) : meta.decimal,
    ema20: asNumber(quote.ema20, price),
    ema50: asNumber(quote.ema50, price),
    rsi14: asNumber(quote.rsi14, 50),
    atr14,
    marketStructure: quote.marketStructure || 'RANGE',
    htfStructure: quote.htfStructure || quote.marketStructure || 'RANGE',
    htfEma20: asNumber(quote.htfEma20, asNumber(quote.ema20, price)),
    htfEma50: asNumber(quote.htfEma50, asNumber(quote.ema50, price)),
    maxSpreadAllowed: asNumber(quote.maxSpreadAllowed, normalized === 'USDJPY' || normalized === 'XAUUSD' ? 3 : 2.5),
    newsRisk: quote.newsRisk || 'LOW',
    dataType: quote.dataType || quote.provider || 'FRONTEND_CONTEXT',
    provider: quote.provider || quote.dataType || 'FRONTEND_CONTEXT',
    timestamp: quote.timestamp || new Date().toISOString(),
  };
}

function normalizeProfiles(profiles) {
  if (!Array.isArray(profiles) || !profiles.length) return defaultStrategyProfiles;
  return profiles
    .map(profile => ({
      id: String(profile.id || '').trim(),
      name: String(profile.name || '').trim(),
      stopAtr: asNumber(profile.stopAtr, NaN),
      targetAtr: asNumber(profile.targetAtr, NaN),
      minRR: asNumber(profile.minRR, NaN),
      confidenceBoost: asNumber(profile.confidenceBoost, 0),
    }))
    .filter(profile =>
      profile.id &&
      profile.name &&
      Number.isFinite(profile.stopAtr) &&
      Number.isFinite(profile.targetAtr) &&
      Number.isFinite(profile.minRR)
    );
}

function evaluateStrategy(symbol, quote, profile) {
  const data = normalizeQuote(symbol, quote);
  const emaBullish = data.ema20 > data.ema50;
  const emaBearish = data.ema20 < data.ema50;
  const rsiBullish = data.rsi14 >= 52;
  const rsiBearish = data.rsi14 <= 48;
  const htfBullish = data.htfEma20 > data.htfEma50 && data.htfStructure === 'BULLISH';
  const htfBearish = data.htfEma20 < data.htfEma50 && data.htfStructure === 'BEARISH';
  const spreadPips = Math.abs(data.ask - data.bid) / pipSize(symbol);
  const isGold = symbol === 'XAUUSD';

  if (profile.id === 'gold-conservative' && !isGold) return null;
  if (isGold && profile.id !== 'gold-conservative' && profile.minRR < 2) return null;

  const direction = emaBullish && rsiBullish && htfBullish
    ? 'BUY'
    : emaBearish && rsiBearish && htfBearish
      ? 'SELL'
      : 'NO_TRADE';

  const rejections = [];
  if (direction === 'NO_TRADE') rejections.push('Trend, RSI, and higher timeframe are not aligned');
  if (data.marketStructure === 'RANGE' || data.htfStructure === 'RANGE') rejections.push('Range structure');
  if (data.newsRisk === 'HIGH') rejections.push('High news risk');
  if (spreadPips > data.maxSpreadAllowed) rejections.push(`Spread ${spreadPips.toFixed(1)} pips`);

  const symbolPipSize = pipSize(symbol);
  const atr = Math.max(data.atr14 || symbolPipSize * 20, symbolPipSize * 8);
  const entry = direction === 'BUY' ? data.ask : direction === 'SELL' ? data.bid : data.price;
  const stopLoss = direction === 'BUY' ? entry - (atr * profile.stopAtr) : entry + (atr * profile.stopAtr);
  const takeProfit = direction === 'BUY' ? entry + (atr * profile.targetAtr) : entry - (atr * profile.targetAtr);
  const stopPips = Math.abs(entry - stopLoss) / symbolPipSize;
  const targetPips = Math.abs(takeProfit - entry) / symbolPipSize;
  const rr = stopPips > 0 ? targetPips / stopPips : 0;

  if (rr < profile.minRR) rejections.push(`RR ${rr.toFixed(2)} below ${profile.minRR.toFixed(2)}`);

  let score = 0;
  score += direction !== 'NO_TRADE' ? 35 : 0;
  score += data.marketStructure !== 'RANGE' ? 15 : 0;
  score += (htfBullish || htfBearish) ? 15 : 0;
  score += Math.max(0, 15 - spreadPips);
  score += Math.min(20, rr * 8);
  score += profile.confidenceBoost;
  score -= data.newsRisk === 'MEDIUM' ? 8 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));

  if (rejections.length > 0) score = Math.min(score, 60);

  return {
    symbol,
    strategyId: profile.id,
    strategyName: profile.name,
    signalType: rejections.length === 0 ? direction : 'NO_TRADE',
    confidence: score,
    entry,
    stopLoss,
    takeProfit,
    stopPips,
    targetPips,
    rr,
    rejections,
    provider: data.provider,
    timestamp: data.timestamp,
  };
}

async function analyzeStrategies({ requestedSymbols, profiles, quoteMap }) {
  const candidates = [];
  for (const symbol of requestedSymbols) {
    const quote = quoteMap?.[symbol] ? normalizeQuote(symbol, quoteMap[symbol]) : await getQuote(symbol);
    for (const profile of profiles) {
      const result = evaluateStrategy(symbol, quote, profile);
      if (result) candidates.push(result);
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence || b.rr - a.rr);
  return {
    candidates,
    best: candidates[0] || null,
  };
}

function calculateMarginRequired(symbol, lotSize, entryPrice) {
  const notionalPrice = symbol.includes('JPY') ? 1 : entryPrice;
  return lotSize * 100000 * notionalPrice * 0.02;
}

function estimateTradeRiskDollars(position = {}) {
  const stopLossPips = asNumber(position.stopLossPips, NaN);
  const lotSize = asNumber(position.lotSize, NaN);
  if (Number.isFinite(stopLossPips) && stopLossPips > 0 && Number.isFinite(lotSize) && lotSize > 0) {
    return stopLossPips * 10 * lotSize;
  }

  const entryPrice = asNumber(position.entryPrice, NaN);
  const stopLossPrice = asNumber(position.stopLossPrice, NaN);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLossPrice) || !Number.isFinite(lotSize) || lotSize <= 0) {
    return 0;
  }
  const stopPips = Math.abs(entryPrice - stopLossPrice) / pipSize(String(position.symbol || 'EURUSD').toUpperCase());
  return stopPips * 10 * lotSize;
}

function assessRisk({
  plan,
  account = {},
  openPositions = [],
  riskPercent = 1,
  maxRiskPct = 1,
  maxOpenTrades = 2,
  dailyLossLimit = 250,
  dailyRealizedLoss = 0,
  maxPortfolioHeatPct = 3,
  maxSymbolExposure = 1,
  killSwitch = false,
}) {
  const balance = asNumber(account.balance, 10000);
  const equity = asNumber(account.equity, balance);
  const requestedRiskPct = asNumber(riskPercent, 1);
  const requestedRiskDollars = balance * (requestedRiskPct / 100);
  const currentOpenTrades = Array.isArray(openPositions) ? openPositions.length : 0;
  const currentPortfolioRisk = (Array.isArray(openPositions) ? openPositions : []).reduce(
    (sum, position) => sum + estimateTradeRiskDollars(position),
    0
  );
  const portfolioHeatPct = equity > 0 ? (currentPortfolioRisk / equity) * 100 : 0;
  const projectedPortfolioHeatPct = equity > 0 ? ((currentPortfolioRisk + requestedRiskDollars) / equity) * 100 : 0;
  const symbolExposureCount = (Array.isArray(openPositions) ? openPositions : []).filter(
    position => String(position.symbol || '').toUpperCase() === String(plan?.symbol || '').toUpperCase()
  ).length;
  const duplicateDirection = (Array.isArray(openPositions) ? openPositions : []).some(position =>
    String(position.symbol || '').toUpperCase() === String(plan?.symbol || '').toUpperCase() &&
    String(position.direction || '').toUpperCase() === String(plan?.signalType || '').toUpperCase()
  );
  const realizedLoss = Math.max(0, asNumber(dailyRealizedLoss, 0));

  const violations = [];
  if (killSwitch) violations.push('Kill switch is active');
  if (!plan || plan.signalType === 'NO_TRADE') violations.push('No tradeable plan is available');
  if (requestedRiskPct > maxRiskPct) violations.push(`Requested risk ${requestedRiskPct.toFixed(2)}% exceeds max ${maxRiskPct.toFixed(2)}%`);
  if (currentOpenTrades >= maxOpenTrades) violations.push(`Open trade limit ${maxOpenTrades} reached`);
  if (duplicateDirection) violations.push('Duplicate same-symbol same-direction trade blocked');
  if (symbolExposureCount >= maxSymbolExposure) violations.push(`Symbol exposure cap ${maxSymbolExposure} reached for ${plan?.symbol || 'symbol'}`);
  if (projectedPortfolioHeatPct > maxPortfolioHeatPct) violations.push(`Projected portfolio heat ${projectedPortfolioHeatPct.toFixed(2)}% exceeds cap ${maxPortfolioHeatPct.toFixed(2)}%`);
  if (realizedLoss >= dailyLossLimit) violations.push(`Daily loss guard triggered at $${realizedLoss.toFixed(2)}`);

  return {
    approved: violations.length === 0,
    requestedRiskPct,
    requestedRiskDollars,
    currentOpenTrades,
    symbolExposureCount,
    portfolioHeatPct: Number(portfolioHeatPct.toFixed(2)),
    projectedPortfolioHeatPct: Number(projectedPortfolioHeatPct.toFixed(2)),
    dailyRealizedLoss: realizedLoss,
    dailyLossLimit,
    locks: {
      riskLock: violations.length > 0,
      killSwitch: Boolean(killSwitch),
      dailyLossGuard: realizedLoss >= dailyLossLimit,
    },
    limits: {
      maxRiskPct,
      maxOpenTrades,
      maxPortfolioHeatPct,
      maxSymbolExposure,
    },
    violations,
  };
}

function simulatePaperExecution({ plan, account = {}, riskPercent = 1, source = 'AI auto paper trading' }) {
  if (!plan || !plan.symbol || !plan.signalType || !Number.isFinite(asNumber(plan.entry, NaN))) {
    throw new Error('A valid trade plan is required');
  }
  if (plan.signalType === 'NO_TRADE') {
    return { approved: false, reason: 'Plan is not tradeable', mode: 'PAPER' };
  }

  const balance = asNumber(account.balance, 10000);
  const equity = asNumber(account.equity, balance);
  const marginUsed = asNumber(account.marginUsed, 0);
  const stopPips = asNumber(plan.stopPips, 0);
  if (!Number.isFinite(stopPips) || stopPips <= 0) {
    return { approved: false, reason: 'Invalid stop distance', mode: 'PAPER' };
  }

  const riskDollars = balance * (asNumber(riskPercent, 1) / 100);
  const lotSize = Math.max(0.01, Math.min(5, Math.floor((riskDollars / (stopPips * 10)) * 100) / 100));
  const marginRequired = calculateMarginRequired(plan.symbol, lotSize, asNumber(plan.entry));
  const availableMargin = Math.max(0, equity - marginUsed);
  if (!Number.isFinite(lotSize) || lotSize <= 0) {
    return { approved: false, reason: 'Invalid lot size', mode: 'PAPER' };
  }
  if (marginRequired > availableMargin) {
    return { approved: false, reason: 'Insufficient available paper margin', mode: 'PAPER' };
  }

  return {
    approved: true,
    mode: 'PAPER',
    riskDollars,
    availableMargin,
    trade: {
      id: Date.now(),
      symbol: plan.symbol,
      direction: plan.signalType,
      lotSize,
      entryPrice: asNumber(plan.entry),
      stopLossPrice: asNumber(plan.stopLoss),
      takeProfitPrice: asNumber(plan.takeProfit),
      stopLossPips: stopPips,
      takeProfitPips: asNumber(plan.targetPips),
      entryTime: new Date().toLocaleString(),
      marginRequired,
      currentPrice: asNumber(plan.entry),
      floatingPnl: 0,
      status: 'open',
      source,
      strategyId: plan.strategyId || '',
      strategyName: plan.strategyName || '',
      confidence: asNumber(plan.confidence, 0),
    },
  };
}

function runSqlite(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', [path.join(__dirname, 'sqlite_bridge.py')], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || `sqlite bridge exited ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify({ action, dbPath: DB_PATH, ...payload }));
  });
}

async function appendAuditEvent(stage, eventType, details = {}) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stage,
    eventType,
    symbol: details.symbol || '',
    status: details.status || '',
    message: details.message || '',
    timestamp: new Date().toISOString(),
    payload: details.payload || {},
  };
  memoryAuditEvents.unshift(event);
  if (memoryAuditEvents.length > 200) memoryAuditEvents.length = 200;
  try {
    await runSqlite('append_agent_event', { event });
  } catch (error) {
    console.error(`Audit event write failed for ${stage}: ${error.message}`);
  }
  return event;
}

async function appendPipelineRun(run) {
  memoryPipelineRuns.unshift(run);
  if (memoryPipelineRuns.length > 100) memoryPipelineRuns.length = 100;
  try {
    await runSqlite('upsert_pipeline_run', { run });
  } catch (error) {
    console.error(`Pipeline run write failed: ${error.message}`);
  }
  return run;
}

function buildRunDiff(primaryRun, secondaryRun) {
  const primaryPlan = primaryRun?.approvedTrade || primaryRun?.topCandidates?.[0] || {};
  const secondaryPlan = secondaryRun?.approvedTrade || secondaryRun?.topCandidates?.[0] || {};
  const primaryConfidence = asNumber(primaryPlan.confidence, 0);
  const secondaryConfidence = asNumber(secondaryPlan.confidence, 0);
  const primaryHeat = asNumber(primaryRun?.riskAssessment?.projectedPortfolioHeatPct, 0);
  const secondaryHeat = asNumber(secondaryRun?.riskAssessment?.projectedPortfolioHeatPct, 0);
  const primaryRiskApproved = Boolean(primaryRun?.riskAssessment?.approved);
  const secondaryRiskApproved = Boolean(secondaryRun?.riskAssessment?.approved);
  return {
    primaryRunId: primaryRun?.id || '',
    secondaryRunId: secondaryRun?.id || '',
    primarySymbol: primaryRun?.symbol || '',
    secondarySymbol: secondaryRun?.symbol || '',
    primaryStatus: primaryRun?.status || '',
    secondaryStatus: secondaryRun?.status || '',
    confidenceDelta: Number((primaryConfidence - secondaryConfidence).toFixed(2)),
    projectedHeatDelta: Number((primaryHeat - secondaryHeat).toFixed(2)),
    riskApprovalChanged: primaryRiskApproved !== secondaryRiskApproved,
    summary: primaryRiskApproved
      ? `Primary run is clearer by ${Number((primaryConfidence - secondaryConfidence).toFixed(0))} confidence points`
      : `Primary run remains risk-blocked relative to ${secondaryRun?.symbol || 'comparison run'}`,
  };
}

async function runPipeline(body = {}) {
  const requestedSymbols = Array.isArray(body.symbols) && body.symbols.length
    ? body.symbols.map(symbol => String(symbol || '').toUpperCase()).filter(symbol => symbols[symbol])
    : Object.keys(symbols);
  const profiles = normalizeProfiles(body.profiles);
  const quoteMap = body.quotes && typeof body.quotes === 'object' ? body.quotes : null;
  const analysis = await analyzeStrategies({ requestedSymbols, profiles, quoteMap });

  const quantEvent = await appendAuditEvent('quant', 'analysis', {
    symbol: analysis.best?.symbol || '',
    status: analysis.best ? 'completed' : 'empty',
    message: analysis.best
      ? `Best candidate ${analysis.best.symbol} ${analysis.best.signalType} at ${analysis.best.confidence}% confidence`
      : 'No strategy candidates available',
    payload: {
      analyzedSymbols: requestedSymbols,
      profileCount: profiles.length,
      candidateCount: analysis.candidates.length,
      best: analysis.best,
    },
  });

  const riskInput = {
    ...body,
    plan: analysis.best,
  };
  const assessment = assessRisk(riskInput);
  const riskEvent = await appendAuditEvent('risk', 'assessment', {
    symbol: analysis.best?.symbol || '',
    status: assessment.approved ? 'approved' : 'blocked',
    message: assessment.approved
      ? `Risk approved for ${analysis.best?.symbol || 'candidate'} at ${assessment.requestedRiskPct.toFixed(2)}%`
      : `Risk blocked: ${(assessment.violations || []).join('; ')}`,
    payload: {
      plan: analysis.best || null,
      assessment,
    },
  });

  let simulation = null;
  let executionEvent = null;
  if (assessment.approved && body.executeIfApproved !== false && analysis.best) {
    simulation = simulatePaperExecution({
      plan: analysis.best,
      account: body.account || {},
      riskPercent: body.riskPercent,
      source: body.source || 'Pipeline paper simulation',
    });
    executionEvent = await appendAuditEvent('execution', 'simulation', {
      symbol: analysis.best.symbol || '',
      status: simulation.approved ? 'approved' : 'blocked',
      message: simulation.approved
        ? `Simulated ${simulation.trade.symbol} ${simulation.trade.direction} paper execution`
        : `Execution simulation blocked: ${simulation.reason || 'unknown reason'}`,
      payload: {
        plan: analysis.best,
        simulation,
      },
    });
  }

  const pipelineStatus = !analysis.best
    ? 'empty'
    : assessment.approved
      ? (simulation?.approved ? 'approved' : 'blocked')
      : 'blocked';
  const pipelineEvent = await appendAuditEvent('pipeline', 'run', {
    symbol: analysis.best?.symbol || '',
    status: pipelineStatus,
    message: !analysis.best
      ? 'Pipeline completed with no qualifying candidate'
      : assessment.approved
        ? `Pipeline approved ${analysis.best.symbol} ${analysis.best.signalType}`
        : `Pipeline blocked ${analysis.best.symbol}: ${(assessment.violations || []).join('; ')}`,
    payload: {
      best: analysis.best || null,
      assessment,
      simulation,
    },
  });
  const result = {
    ok: true,
    mode: 'paper',
    runId: pipelineEvent.id,
    source: quoteMap ? 'frontend-context' : 'backend-market-data',
    analyzedSymbols: requestedSymbols,
    profileCount: profiles.length,
    rankedCandidates: analysis.candidates,
    approvedTrade: assessment.approved ? analysis.best : null,
    riskAssessment: assessment,
    execution: simulation,
    auditRefs: [quantEvent?.id, riskEvent?.id, executionEvent?.id, pipelineEvent?.id].filter(Boolean),
  };
  await appendPipelineRun({
    id: pipelineEvent.id,
    status: pipelineStatus,
    symbol: analysis.best?.symbol || '',
    mode: result.mode,
    source: result.source,
    message: pipelineEvent.message,
    timestamp: pipelineEvent.timestamp,
    approvedTrade: result.approvedTrade,
    riskAssessment: result.riskAssessment,
    execution: result.execution,
    auditRefs: result.auditRefs,
    topCandidates: result.rankedCandidates.slice(0, 3),
  });
  return result;
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (url.pathname === '/api/health') {
    return send(res, 200, {
      ok: true,
      mode: 'paper-read-first',
      orderExecution: 'disabled',
      manualApprovalRequired: true,
      providers: {
        twelveData: Boolean(TWELVE_DATA_API_KEY),
        alphaVantage: Boolean(ALPHA_VANTAGE_API_KEY),
        exchangeRateFallback: true,
        sqlite: true,
      },
      dbPath: DB_PATH,
    });
  }

  const quoteMatch = url.pathname.match(/^\/api\/quotes\/([A-Za-z0-9]+)$/);
  if (quoteMatch && req.method === 'GET') {
    const quote = await getQuote(quoteMatch[1]);
    return send(res, 200, quote);
  }

  const indicatorsMatch = url.pathname.match(/^\/api\/indicators\/([A-Za-z0-9]+)$/);
  if (indicatorsMatch && req.method === 'GET') {
    const quote = await getQuote(indicatorsMatch[1]);
    return send(res, 200, {
      symbol: quote.symbol,
      ema20: quote.ema20,
      ema50: quote.ema50,
      rsi14: quote.rsi14,
      atr14: quote.atr14,
      marketStructure: quote.marketStructure,
      htfStructure: quote.htfStructure,
      provider: quote.provider,
      timestamp: quote.timestamp,
    });
  }

  if (url.pathname === '/api/news' && req.method === 'GET') {
    const query = url.searchParams.get('query') || 'forex gold central bank market news';
    return send(res, 200, {
      query,
      provider: 'backend-placeholder',
      items: [],
      message: 'News MCP/search can be connected here. No API key is exposed to the frontend.',
    });
  }

  if (url.pathname === '/api/journal' && req.method === 'GET') {
    return send(res, 200, await runSqlite('list_trades'));
  }

  if (url.pathname === '/api/journal' && req.method === 'POST') {
    const body = await parseBody(req);
    return send(res, 200, await runSqlite('upsert_trade', { trade: body.trade || body }));
  }

  if (url.pathname === '/api/journal' && req.method === 'DELETE') {
    return send(res, 200, await runSqlite('clear_trades'));
  }

  if (url.pathname === '/api/audit/logs' && req.method === 'GET') {
    const limit = asNumber(url.searchParams.get('limit'), 50);
    try {
      return send(res, 200, await runSqlite('list_agent_events', { limit }));
    } catch (error) {
      return send(res, 200, {
        events: memoryAuditEvents.slice(0, Math.max(1, Math.min(limit, 200))),
        source: 'memory-fallback',
        warning: error.message,
      });
    }
  }

  if (url.pathname === '/api/pipeline/runs' && req.method === 'GET') {
    const limit = asNumber(url.searchParams.get('limit'), 12);
    try {
      return send(res, 200, await runSqlite('list_pipeline_runs', { limit }));
    } catch (error) {
      return send(res, 200, {
        runs: memoryPipelineRuns.slice(0, Math.max(1, Math.min(limit, 100))),
        source: 'memory-fallback',
        warning: error.message,
      });
    }
  }

  if (url.pathname === '/api/pipeline/runs/diff' && req.method === 'GET') {
    const primaryId = url.searchParams.get('primary') || '';
    const secondaryId = url.searchParams.get('secondary') || '';
    if (!primaryId || !secondaryId) return send(res, 400, { error: 'primary and secondary run ids are required' });
    try {
      const primaryPayload = await runSqlite('get_pipeline_run', { id: primaryId });
      const secondaryPayload = await runSqlite('get_pipeline_run', { id: secondaryId });
      if (!primaryPayload.run || !secondaryPayload.run) return send(res, 404, { error: 'One or both runs were not found' });
      return send(res, 200, { diff: buildRunDiff(primaryPayload.run, secondaryPayload.run) });
    } catch (error) {
      const primaryRun = memoryPipelineRuns.find(item => item.id === primaryId) || null;
      const secondaryRun = memoryPipelineRuns.find(item => item.id === secondaryId) || null;
      if (!primaryRun || !secondaryRun) return send(res, 404, { error: 'One or both runs were not found', warning: error.message });
      return send(res, 200, {
        diff: buildRunDiff(primaryRun, secondaryRun),
        source: 'memory-fallback',
        warning: error.message,
      });
    }
  }

  const pipelineRunMatch = url.pathname.match(/^\/api\/pipeline\/runs\/([^/]+)$/);
  if (pipelineRunMatch && req.method === 'GET') {
    const runId = decodeURIComponent(pipelineRunMatch[1]);
    try {
      const payload = await runSqlite('get_pipeline_run', { id: runId });
      return send(res, payload.run ? 200 : 404, payload.run ? payload : { error: 'Run not found' });
    } catch (error) {
      const run = memoryPipelineRuns.find(item => item.id === runId) || null;
      return send(res, run ? 200 : 404, run
        ? { run, source: 'memory-fallback', warning: error.message }
        : { error: 'Run not found', warning: error.message });
    }
  }

  if (url.pathname === '/api/agents/quant/analyze' && req.method === 'POST') {
    const body = await parseBody(req);
    const requestedSymbols = Array.isArray(body.symbols) && body.symbols.length
      ? body.symbols.map(symbol => String(symbol || '').toUpperCase()).filter(symbol => symbols[symbol])
      : Object.keys(symbols);
    const profiles = normalizeProfiles(body.profiles);
    const quoteMap = body.quotes && typeof body.quotes === 'object' ? body.quotes : null;
    const analysis = await analyzeStrategies({ requestedSymbols, profiles, quoteMap });
    await appendAuditEvent('quant', 'analysis', {
      symbol: analysis.best?.symbol || '',
      status: analysis.best ? 'completed' : 'empty',
      message: analysis.best
        ? `Best candidate ${analysis.best.symbol} ${analysis.best.signalType} at ${analysis.best.confidence}% confidence`
        : 'No strategy candidates available',
      payload: {
        analyzedSymbols: requestedSymbols,
        profileCount: profiles.length,
        candidateCount: analysis.candidates.length,
        best: analysis.best,
      },
    });
    return send(res, 200, {
      ok: true,
      timestamp: new Date().toISOString(),
      source: quoteMap ? 'frontend-context' : 'backend-market-data',
      analyzedSymbols: requestedSymbols,
      profileCount: profiles.length,
      ...analysis,
    });
  }

  if (url.pathname === '/api/agents/risk/assess' && req.method === 'POST') {
    const body = await parseBody(req);
    const assessment = assessRisk(body);
    await appendAuditEvent('risk', 'assessment', {
      symbol: body?.plan?.symbol || '',
      status: assessment.approved ? 'approved' : 'blocked',
      message: assessment.approved
        ? `Risk approved for ${body?.plan?.symbol || 'candidate'} at ${assessment.requestedRiskPct.toFixed(2)}%`
        : `Risk blocked: ${(assessment.violations || []).join('; ')}`,
      payload: {
        plan: body?.plan || null,
        assessment,
      },
    });
    return send(res, 200, assessment);
  }

  if (url.pathname === '/api/portfolio/state' && req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      mode: 'paper',
      execution: 'simulation-only',
      riskLocks: {
        killSwitch: false,
        dailyLossGuard: false,
        riskLock: false,
      },
      limits: {
        maxRiskPct: 1,
        maxOpenTrades: 2,
        maxPortfolioHeatPct: 3,
      },
      message: 'Portfolio state is backend-scoped. The frontend can post its current state to /api/agents/risk/assess for live evaluation.',
    });
  }

  if (url.pathname === '/api/agents/execution/simulate' && req.method === 'POST') {
    const body = await parseBody(req);
    const simulation = simulatePaperExecution(body);
    await appendAuditEvent('execution', 'simulation', {
      symbol: body?.plan?.symbol || simulation?.trade?.symbol || '',
      status: simulation.approved ? 'approved' : 'blocked',
      message: simulation.approved
        ? `Simulated ${simulation.trade.symbol} ${simulation.trade.direction} paper execution`
        : `Execution simulation blocked: ${simulation.reason || 'unknown reason'}`,
      payload: {
        plan: body?.plan || null,
        simulation,
      },
    });
    return send(res, 200, simulation);
  }

  if (url.pathname === '/api/agents/pipeline/run' && req.method === 'POST') {
    const body = await parseBody(req);
    return send(res, 200, await runPipeline(body));
  }

  if (url.pathname === '/api/backtest' && req.method === 'POST') {
    const body = await parseBody(req);
    return send(res, 200, {
      ok: true,
      mode: 'placeholder',
      symbol: body.symbol || 'EURUSD',
      message: 'Backtest endpoint is reserved for historical strategy runs. No orders are placed.',
    });
  }

  send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  const filePath = url.pathname === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, url.pathname);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    serveStatic(req, res, url);
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`ScorpXGT backend running at http://127.0.0.1:${PORT}`);
  console.log(`SQLite journal: ${DB_PATH}`);
});
