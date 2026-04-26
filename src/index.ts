/**
 * @fileoverview Tatua Gateway - Entry point
 *
 * Starts the Express server that:
 *  - Receives M-Pesa callbacks from Safaricom (/daraja/*)
 *  - Serves the SDK API for businesses (/api/*)
 *  - Provides admin management endpoints (/admin/*)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import darajaRoutes from './routes/daraja';
import apiRoutes from './routes/api';
import adminRoutes from './routes/admin';

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Safaricom fires callbacks here
app.use('/daraja', darajaRoutes);

// SDK / business API
app.use('/api', apiRoutes);

// Internal admin management
app.use('/admin', adminRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Tatua Gateway',
    environment: process.env.DARAJA_ENVIRONMENT || 'sandbox',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'Tatua Payment Gateway',
    version: '1.0.0',
    docs: 'https://github.com/your-org/tatua',
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║         TATUA PAYMENT GATEWAY                ║
║══════════════════════════════════════════════║
║  Running on port: ${String(PORT).padEnd(25)}║
║  Environment: ${(process.env.DARAJA_ENVIRONMENT || 'sandbox').padEnd(29)}║
║  Gateway URL: ${(process.env.GATEWAY_BASE_URL || 'not set').padEnd(29)}║
╚══════════════════════════════════════════════╝
  `);
});

export default app;
