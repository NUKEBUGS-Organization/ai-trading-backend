/** Shared WebSocket broadcast for HTTP routes (e.g. MT5 account from Python). */
let broadcastFn = null;
let lastMt5AccountAt = 0;

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
  broadcastMt5AccountFromPayload,
  extractWsAccountFromEnginePayload,
};
