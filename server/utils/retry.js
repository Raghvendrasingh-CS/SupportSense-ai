// retry.js — Exponential backoff retry wrapper for external service calls
// Adds resilience to Microsoft Graph, Fabric IQ, and Work IQ API interactions

import { log, logError } from './logger.js';

const MODULE = 'Retry';

/**
 * Wraps an async function with retry logic using exponential backoff.
 * 
 * @param {Function} fn - The async function to retry
 * @param {object} options - Retry options
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {number} [options.baseDelayMs=500] - Base delay in milliseconds (doubled each retry)
 * @param {number} [options.timeoutMs=10000] - Timeout per attempt in milliseconds
 * @param {string} [options.label='unknown'] - Label for logging
 * @returns {Promise<any>} The result of the function call
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 500,
    timeoutMs = 10000,
    label = 'unknown',
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(MODULE, `[${label}] Attempt ${attempt}/${maxRetries}`);
      
      // Add AbortSignal timeout if supported
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      
      if (attempt > 1) {
        log(MODULE, `[${label}] Succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      logError(MODULE, `[${label}] Attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        log(MODULE, `[${label}] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logError(MODULE, `[${label}] All ${maxRetries} attempts failed`);
  throw lastError;
}
