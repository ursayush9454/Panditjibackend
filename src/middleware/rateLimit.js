/**
 * Tiny in-memory rate limiter (no dependency).
 * NOTE: per-process. If you run several instances behind a load balancer, swap the
 * Map for Redis (e.g. rate-limiter-flexible) so limits are shared.
 */
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60 * 1000).unref();

module.exports = ({ windowMs, max, keyFn, message = "Too many requests, please try again later" }) =>
  (req, res, next) => {
    const key = `${req.baseUrl}${req.path}:${keyFn ? keyFn(req) : req.ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      res.set("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message });
    }
    next();
  };
