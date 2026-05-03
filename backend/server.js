const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SCORPX_BACKEND_PORT || 8000);
const DB_PATH = process.env.SCORPX_DB_PATH || path.join(ROOT, 'scorpx-trading-journal.db');
const ALPHA_VANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY || '';
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || '';

const symbols = {
  EURUSD: { pair: 'EUR/USD', base: 'EUR', quote: 'USD', decimal: 5, yahoo: 'EURUSD=X' },
  GBPUSD: { pair: 'GBP/USD', base: 'GBP', quote: 'USD', decimal: 5, yahoo: 'GBPUSD=X' },
  USDJPY: { pair: 'USD/JPY', base: 'USD', quote: 'JPY', decimal: 3, yahoo: 'JPY=X' },
  AUDUSD: { pair: 'AUD/USD', base: 'AUD', quote: 'USD', decimal: 5, yahoo: 'AUDUSD=X' },
  USDCAD: { pair: 'USD/CAD', base: 'USD', quote: 'CAD', decimal: 5, yahoo: 'CAD=X' },
  USDCHF: { pair: 'USD/CHF', base: 'USD', quote: 'CHF', decimal: 5, yahoo: 'CHF=X' },
  XAUUSD: { pair: 'XAU/USD', base: 'XAU', quote: 'USD', decimal: 2, yahoo: 'GC=F' },
};

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
