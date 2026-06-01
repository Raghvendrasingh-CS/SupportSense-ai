// API client for SupportSense backend with error handling and logging.
const API_BASE = '/api';
const MODULE = 'APIClient';

function log(message, data) {
  console.log(`[${MODULE}] ${new Date().toISOString()} ${message}`, data ?? '');
}

async function request(endpoint, options = {}) {
  const start = performance.now();
  try {
    log(`Request: ${options.method || 'GET'} ${endpoint}`);
    const apiKey = import.meta.env.VITE_DEMO_API_KEY || 'demo-key';
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...options.headers 
      },
      ...options,
    });

    const data = await response.json();
    const processingTimeMs = Math.round(performance.now() - start);

    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    log(`Response: ${endpoint}`, { processingTimeMs });
    return { ...data, clientProcessingTimeMs: processingTimeMs };
  } catch (error) {
    console.error(`[${MODULE}] ${new Date().toISOString()} ERROR: ${endpoint}`, error);
    throw error;
  }
}

export const api = {
  getHealth: () => request('/health'),
  getConfig: () => request('/config'),
  getTickets: () => request('/tickets'),
  getTicket: (id) => request(`/tickets/${id}`),
  createTicket: (data) => request('/tickets', { method: 'POST', body: JSON.stringify(data) }),
  processTicket: (id) => request(`/tickets/${id}/process`, { method: 'POST' }),
  seedDemo: () => request('/demo/seed', { method: 'POST' }),
  getAnalytics: () => request('/analytics'),
  getAgentWorkload: () => request('/agents/workload'),
  getSLA: () => request('/sla'),
  getServiceHealth: () => request('/services/health'),
  updateTicket: (id, data) => fetch(`/api/tickets/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(r => r.json()),
};
