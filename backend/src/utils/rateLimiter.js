/**
 * Rate Limiter Class
 * Purpose: Prevent sending too many messages too quickly
 */
class RateLimiter {
  constructor(maxRequests, timeWindowMs) {
    this.maxRequests = maxRequests;
    this.timeWindowMs = timeWindowMs;
    this.requests = new Map(); // key: identifier, value: array of timestamps
  }

  async checkLimit(identifier) {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];
    
    // Remove old requests outside time window
    const validRequests = userRequests.filter(
      timestamp => now - timestamp < this.timeWindowMs
    );
    
    if (validRequests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...validRequests);
      const waitTime = this.timeWindowMs - (now - oldestRequest);
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)}s`);
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }
}

// Create default limiters
const whatsappLimiter = new RateLimiter(30, 60000); // 30 messages per minute
const emailLimiter = new RateLimiter(50, 3600000); // 50 emails per hour

// Export
module.exports = {
  RateLimiter,
  whatsappLimiter,
  emailLimiter
};
