/** Shared WebSocket broadcast for HTTP routes (e.g. MT5 account from Python). */
let broadcastFn = null;
let lastMt5AccountAt = 0;
let lastMt5PricesAt = 0;
let cachedMt5Prices = null;

function setBroadcast(fn) {
  broadcastFn = fn;
}

function broadcast(data) {
  if (typeof broadcastFn === 'function') {
    broadcastFn(data);
  }
}

function markMt5AccountReceived() {
  lastMt5AccountAt = Date.now();
}

function hasRecentMt5Account(maxAgeMs = 30000) {
  return lastMt5AccountAt > 0 && Date.now() - lastMt5AccountAt < maxAgeMs;
}

function markMt5PricesReceived() {
  lastMt5PricesAt = Date.now();
}

function hasRecentMt5Prices(maxAgeMs = 10000) {
  return lastMt5PricesAt > 0 && Date.now() - lastMt5PricesAt < maxAgeMs;
}

function symbolMatchesConfig(configSym, brokerKey) {
  const sym = String(configSym).toUpperCase();
  const ku = String(brokerKey).toUpperCase().replace(/\.$/, '');
  if (ku === sym || ku.startsWith(sym) || sym.startsWith(ku.replace(/M$/, ''))) return true;
  if (sym === 'XAUUSD' && (ku.includes('XAU') || ku === 'GOLD')) return true;
  if (sym === 'GBPUSD' && ku.includes('GBP') && ku.includes('USD')) return true;
  if (sym === 'EURUSD' && ku.includes('EUR') && ku.includes('USD')) return true;
  return false;
}

function isPlausibleLiveQuote(configSym, bid) {
  if (bid == null || bid <= 0) return false;
  if (configSym === 'EURUSD' || configSym === 'GBPUSD') return bid > 0.5 && bid < 3.5;
  if (configSym === 'XAUUSD') return bid > 500 && bid < 20000;
  return true;
}

function normalizePricesForWs(prices) {
  if (!prices || typeof prices !== 'object') return null;
  const out = {};
  for (const [symbol, q] of Object.entries(prices)) {
    if (!q || q.bid == null) continue;
    if (q.live === false) continue;
    const bid = Number(q.bid);
    const ask = Number(q.ask ?? q.bid);
    if (bid <= 0) continue;
    const key = String(symbol).toUpperCase();
    out[key] = {
      bid,
      ask,
      spread: Number(q.spread) || 0,
      live: q.live !== false,
    };
  }

  const configSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD'];
  for (const configSym of configSymbols) {
    if (out[configSym] && isPlausibleLiveQuote(configSym, out[configSym].bid)) continue;
    for (const [brokerKey, q] of Object.entries(prices)) {
      if (!symbolMatchesConfig(configSym, brokerKey)) continue;
      if (q.live === false) continue;
      const bid = Number(q.bid);
      const ask = Number(q.ask ?? q.bid);
      if (!isPlausibleLiveQuote(configSym, bid)) continue;
      out[configSym] = { bid, ask, spread: Number(q.spread) || 0, live: true };
      break;
    }
  }

  for (const configSym of configSymbols) {
    if (out[configSym] && !isPlausibleLiveQuote(configSym, out[configSym].bid)) {
      delete out[configSym];
    }
  }

  return Object.keys(out).length ? out : null;
}

function broadcastMt5PricesFromPayload(body) {
  const prices = normalizePricesForWs(body?.mt5_prices || body?.prices);
  if (!prices) return false;
  cachedMt5Prices = prices;
  markMt5PricesReceived();
  broadcast(
    JSON.stringify({
      type: 'price_update',
      source: 'mt5',
      timestamp: new Date().toISOString(),
      prices,
    })
  );
  return true;
}

function extractWsAccountFromEnginePayload(body) {
  const acc =
    body?.mt5_account ||
    body?.mt5_bridge?.account ||
    body?.account;
  if (acc && (acc.balance != null || acc.equity != null)) {
    return {
      balance: Number(acc.balance) || 0,
      equity: Number(acc.equity) || Number(acc.balance) || 0,
      margin: Number(acc.margin) || 0,
      freeMargin: Number(acc.freeMargin ?? acc.free_margin) || 0,
      marginLevel: Number(acc.marginLevel ?? acc.margin_level) || 0,
      openPositions: Number(acc.openPositions ?? acc.open_positions) || 0,
      dailyPnl: Number(acc.dailyPnl ?? acc.daily_pnl) || 0,
    };
  }
  const risk = body?.engine?.risk;
  if (risk && risk.balance != null) {
    return {
      balance: Number(risk.balance) || 0,
      equity: Number(risk.balance) || 0,
      margin: 0,
      freeMargin: 0,
      marginLevel: 0,
      openPositions: Number(risk.open_positions) || 0,
      dailyPnl: Number(risk.daily_pnl) || 0,
    };
  }
  return null;
}

function broadcastMt5AccountFromPayload(body) {
  const account = extractWsAccountFromEnginePayload(body);
  if (!account || (account.balance <= 0 && account.equity <= 0)) return false;
  markMt5AccountReceived();
  broadcast(
    JSON.stringify({
      type: 'account_update',
      timestamp: new Date().toISOString(),
      account,
      source: 'mt5',
    })
  );
  return true;
}

function getCachedMt5Prices() {
  return cachedMt5Prices;
}

module.exports = {
  setBroadcast,
  broadcast,
  markMt5AccountReceived,
  hasRecentMt5Account,
  markMt5PricesReceived,
  hasRecentMt5Prices,
  getCachedMt5Prices,
  broadcastMt5AccountFromPayload,
  broadcastMt5PricesFromPayload,
  extractWsAccountFromEnginePayload,
  normalizePricesForWs,
  isPlausibleLiveQuote,
  symbolMatchesConfig,
};
