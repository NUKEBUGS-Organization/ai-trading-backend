require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/trades', require('./routes/trades'));
app.use('/api/signals', require('./routes/signals'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/engine', require('./routes/engine'));
app.use('/api/licenses', require('./routes/licenses'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'operational',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ========================================
// WebSocket - Simulated Live Trading Data
// ========================================
const connectedClients = new Set();

wss.on('connection', (ws) => {
  connectedClients.add(ws);
  console.log(`🔌 WebSocket client connected (Total: ${connectedClients.size})`);

  ws.on('close', () => {
    connectedClients.delete(ws);
    console.log(`🔌 WebSocket client disconnected (Total: ${connectedClients.size})`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    connectedClients.delete(ws);
  });
});

// Simulated price feed
let goldPrice = 2365.50;
let eurPrice = 1.0842;
let gbpPrice = 1.2654;

function simulatePriceTick() {
  goldPrice += (Math.random() - 0.48) * 2.5;
  eurPrice += (Math.random() - 0.49) * 0.0008;
  gbpPrice += (Math.random() - 0.49) * 0.0010;

  const data = {
    type: 'price_update',
    timestamp: new Date().toISOString(),
    prices: {
      XAUUSD: { bid: parseFloat(goldPrice.toFixed(2)), ask: parseFloat((goldPrice + 0.30).toFixed(2)), spread: 30 },
      EURUSD: { bid: parseFloat(eurPrice.toFixed(5)), ask: parseFloat((eurPrice + 0.00012).toFixed(5)), spread: 12 },
      GBPUSD: { bid: parseFloat(gbpPrice.toFixed(5)), ask: parseFloat((gbpPrice + 0.00015).toFixed(5)), spread: 15 }
    }
  };

  broadcast(JSON.stringify(data));
}

// Simulated account update
function simulateAccountUpdate() {
  const equity = 52430.80 + (Math.random() - 0.45) * 500;
  const data = {
    type: 'account_update',
    timestamp: new Date().toISOString(),
    account: {
      balance: 52430.80,
      equity: parseFloat(equity.toFixed(2)),
      margin: parseFloat((2100 + Math.random() * 200).toFixed(2)),
      freeMargin: parseFloat((equity - 2100).toFixed(2)),
      marginLevel: parseFloat(((equity / 2100) * 100).toFixed(1)),
      dailyPnl: parseFloat(((equity - 52430.80)).toFixed(2))
    }
  };

  broadcast(JSON.stringify(data));
}

// Simulated signal alert
function simulateSignalAlert() {
  if (Math.random() > 0.7) {
    const directions = ['BUY', 'SELL'];
    const strategies = ['AI Momentum', 'AI Scalper', 'Trend Follower'];
    const direction = directions[Math.floor(Math.random() * 2)];
    
    const data = {
      type: 'signal_alert',
      timestamp: new Date().toISOString(),
      signal: {
        symbol: 'XAUUSD',
        direction,
        confidence: Math.floor(60 + Math.random() * 35),
        entryPrice: parseFloat(goldPrice.toFixed(2)),
        strategy: strategies[Math.floor(Math.random() * strategies.length)],
        qualityScore: parseFloat((5 + Math.random() * 4.5).toFixed(1))
      }
    };

    broadcast(JSON.stringify(data));
  }
}

function broadcast(data) {
  connectedClients.forEach(client => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

// Start intervals
setInterval(simulatePriceTick, 1500);
setInterval(simulateAccountUpdate, 5000);
setInterval(simulateSignalAlert, 10000);

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 AurumX Trading Server running on port ${PORT}`);
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}/ws`);
  console.log(`🌐 API available at http://localhost:${PORT}/api`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
