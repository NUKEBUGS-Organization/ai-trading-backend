/** Shared WebSocket broadcast for HTTP routes (e.g. MT5 account from Python). */
let broadcastFn = null;
let lastMt5AccountAt = 0;
let lastMt5PricesAt = 0;

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

function normalizePricesForWs(prices) {
  if (!prices || typeof prices !== 'object') return null;
  const out = {};
  for (const [symbol, q] of Object.entries(prices)) {
    if (!q || q.bid == null) continue;
    const bid = Number(q.bid);
    const ask = Number(q.ask ?? q.bid);
    if (bid <= 0) continue;
    out[symbol] = {
      bid,
      ask,
      spread: Number(q.spread) || 0,
    };
  }
  return Object.keys(out).length ? out : null;
}

function broadcastMt5PricesFromPayload(body) {
  const prices = normalizePricesForWs(body?.mt5_prices || body?.prices);
  if (!prices) return false;
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

module.exports = {
  setBroadcast,
  broadcast,
  markMt5AccountReceived,
  hasRecentMt5Account,
  markMt5PricesReceived,
  hasRecentMt5Prices,
  broadcastMt5AccountFromPayload,
  broadcastMt5PricesFromPayload,
  extractWsAccountFromEnginePayload,
};
