// Simple in-memory cache implementation
// For production, consider using Redis

class Cache {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  set(key, value, ttl = 300000) { // Default TTL: 5 minutes
    this.store.set(key, value);
    
    // Clear existing timeout if any
    if (this.ttls.has(key)) {
      clearTimeout(this.ttls.get(key));
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      this.delete(key);
    }, ttl);
    
    this.ttls.set(key, timeout);
    return value;
  }

  get(key) {
    return this.store.get(key);
  }

  has(key) {
    return this.store.has(key);
  }

  delete(key) {
    // Clear timeout
    if (this.ttls.has(key)) {
      clearTimeout(this.ttls.get(key));
      this.ttls.delete(key);
    }
    return this.store.delete(key);
  }

  clear() {
    // Clear all timeouts
    for (const timeout of this.ttls.values()) {
      clearTimeout(timeout);
    }
    this.ttls.clear();
    this.store.clear();
  }

  size() {
    return this.store.size;
  }

  // Get all keys
  keys() {
    return Array.from(this.store.keys());
  }

  // Cache middleware
  middleware(keyGenerator, ttl = 300000) {
    return (req, res, next) => {
      const key = keyGenerator(req);
      const cached = this.get(key);
      
      if (cached) {
        return res.json(cached);
      }
      
      // Store original json method
      const originalJson = res.json;
      
      // Override json method to cache response
      res.json = (body) => {
        this.set(key, body, ttl);
        return originalJson.call(res, body);
      };
      
      next();
    };
  }
}

module.exports = new Cache();