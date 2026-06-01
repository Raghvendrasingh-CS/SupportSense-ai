import { config } from '../config/env.js';

// Middleware to check API Key for mutating POST routes
export function checkApiKey(req, res, next) {
  if (config.demoMode) {
    return next();
  }

  const apiKey = process.env.DEMO_API_KEY || 'demo-key';
  const clientKey = req.headers['x-api-key'];

  if (clientKey !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key.' });
  }
  next();
}

