# ai-trading-backend

Node API between the VCL4X dashboard and the canonical Python engine.

- Browser → Node: JWT (`Authorization: Bearer`)
- Node ↔ Python: `ENGINE_SHARED_SECRET` on `X-VCL4X-Engine-Key` (never expose to the browser)
- Mock tokens (`mock-admin-token` / `mock-user-token`): only when `APP_ENV`/`NODE_ENV` is development or test **and** `ALLOW_MOCK_AUTH=true`. Production always rejects them.
- Global auto-trade toggle: admin-only (`protect` + `adminOnly`)
- CORS: explicit allow-list (`CORS_ORIGINS` optional). See `.env.example` and `../ai-tradingbot-pythonengine/ENV.md`.

```bash
npm test
```
