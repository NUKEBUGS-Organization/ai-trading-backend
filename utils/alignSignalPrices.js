const {
  getCachedMt5Prices,
  isPlausibleLiveQuote,
  symbolMatchesConfig,
} = require('../wsHub');

function resolveQuote(configSym, prices) {
  if (!prices) return null;
  const sym = String(configSym).toUpperCase();
  if (prices[sym] && isPlausibleLiveQuote(sym, prices[sym].bid)) {
    return prices[sym];
  }
  for (const [key, q] of Object.entries(prices)) {
    if (!symbolMatchesConfig(sym, key)) continue;
    if (!isPlausibleLiveQuote(sym, q.bid)) continue;
    return q;
  }
  return null;
}

/** Shift entry/SL/TP to live MT5 bid/ask while keeping pip distance. */
function alignSignalToLivePrices(signal, prices = getCachedMt5Prices()) {
  if (!signal || !prices) return signal;
  const sym = String(signal.symbol || 'XAUUSD').toUpperCase();
  const quote = resolveQuote(sym, prices);
  if (!quote) return { ...signal, priceSource: signal.priceSource || 'stored' };

  const direction = String(signal.direction || 'BUY').toUpperCase();
  const liveEntry = direction === 'BUY' ? Number(quote.ask) : Number(quote.bid);
  if (!isPlausibleLiveQuote(sym, liveEntry)) {
    return { ...signal, priceSource: signal.priceSource || 'stored' };
  }

  const oldEntry = Number(signal.entryPrice ?? signal.entry);
  const delta = Number.isFinite(oldEntry) ? liveEntry - oldEntry : 0;
  const digits = sym === 'XAUUSD' ? 2 : (sym === 'USDJPY' || sym === 'GBPJPY' ? 3 : 5);
  const round = (v) => (v == null || !Number.isFinite(Number(v)) ? v : Number((Number(v) + delta).toFixed(digits)));

  const doc = signal.toObject ? signal.toObject() : { ...signal };
  return {
    ...doc,
    entryPrice: Number(liveEntry.toFixed(digits)),
    entry: Number(liveEntry.toFixed(digits)),
    stopLoss: round(doc.stopLoss),
    sl: round(doc.stopLoss ?? doc.sl),
    takeProfit: round(doc.takeProfit),
    tp: round(doc.takeProfit ?? doc.tp),
    priceSource: 'mt5_live',
    liveBid: quote.bid,
    liveAsk: quote.ask,
  };
}

function alignSignalsList(signals) {
  const prices = getCachedMt5Prices();
  if (!prices) return signals;
  return signals.map((s) => alignSignalToLivePrices(s, prices));
}

module.exports = { alignSignalToLivePrices, alignSignalsList };
