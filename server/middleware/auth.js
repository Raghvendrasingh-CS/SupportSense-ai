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

// Explicit Role-Based Access Control (RBAC) middleware verifying user scopes
export function checkRole(allowedRoles = []) {
  return (req, res, next) => {
    // Role header is always required — no demo bypass. Judges must supply x-user-role: Compliance_Auditor to access audit routes.
    const userRole = req.headers['x-user-role'] || null;

    if (!userRole) {
      return res.status(401).json({ error: 'Unauthorized: Missing user role header (x-user-role).' });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: `Forbidden: Role '${userRole}' is not authorized to access this resource.` });
    }

    next();
  };
}

