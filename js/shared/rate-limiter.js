/**
 * Rate Limiter — simple in-memory sliding window
 * Usage:
 *   import { createLimiter, checkRateLimit } from '../shared/rate-limiter.js';
 *   const myLimiter = createLimiter(3, 60_000); // 3 per minute
 *   if (!checkRateLimit(myLimiter, 'action name')) return;
 */

/**
 * Creates a limiter: max `limit` calls within `windowMs` milliseconds
 */
export function createLimiter(limit = 5, windowMs = 60_000) {
  return { limit, windowMs, timestamps: [] };
}

/**
 * Returns true if the action is allowed, false if rate limit exceeded.
 * Shows a toast warning when blocked.
 */
export function checkRateLimit(limiter, actionLabel = 'esta acción') {
  const now = Date.now();
  // Remove timestamps outside the window
  limiter.timestamps = limiter.timestamps.filter(t => now - t < limiter.windowMs);

  if (limiter.timestamps.length >= limiter.limit) {
    const wait = Math.ceil((limiter.windowMs - (now - limiter.timestamps[0])) / 1000);
    // Show toast if Helpers is available
    if (window.Helpers?.toast) {
      window.Helpers.toast(
        `Demasiados intentos para "${actionLabel}". Espera ${wait}s.`,
        'warning'
      );
    }
    return false;
  }

  limiter.timestamps.push(now);
  return true;
}

// Pre-built limiters for common actions
export const messageLimiter      = createLimiter(20, 60_000);  // 20 messages / min
export const paymentProofLimiter = createLimiter(3,  3_600_000); // 3 uploads / hour
export const commentLimiter      = createLimiter(10, 60_000);  // 10 comments / min
export const likeLimiter         = createLimiter(30, 60_000);  // 30 likes / min
