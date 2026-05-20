import { createClient } from 'redis';

let redisClient = null;
let isRedisAvailable = false;

// Local In-Memory Fallback Cache
class LocalMemoryCache {
  constructor() {
    this.store = new Map();
  }

  set(key, value, ttlSeconds) {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.store.set(key, { value, expiresAt });
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  del(key) {
    this.store.delete(key);
  }
}

const localCache = new LocalMemoryCache();

// Initialize Redis Client
const initRedis = async () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('⚠️ REDIS_URL not configured. Using local in-memory fallback cache.');
    return;
  }

  try {
    redisClient = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 1) {
            // End reconnect retries after 1 attempt
            return false;
          }
          return 500; // Retry after 500ms
        }
      }
    });
    
    redisClient.on('error', (err) => {
      if (isRedisAvailable) {
        console.warn('⚠️ Redis connection lost. Falling back to local in-memory cache.');
        isRedisAvailable = false;
      }
    });

    await redisClient.connect();
    isRedisAvailable = true;
    console.log('🚀 Redis cache connected successfully.');
  } catch (error) {
    console.warn('⚠️ Failed to connect to Redis. Using local in-memory cache:', error.message);
    redisClient = null;
    isRedisAvailable = false;
  }
};

// Async call to initialize Redis on startup
initRedis();

export default {
  async set(key, value, ttlSeconds = 600) {
    if (isRedisAvailable && redisClient) {
      try {
        await redisClient.set(key, String(value), {
          EX: ttlSeconds
        });
        return;
      } catch (err) {
        console.error('Redis SET error, falling back to local cache:', err);
        isRedisAvailable = false;
      }
    }
    localCache.set(key, value, ttlSeconds);
  },

  async get(key) {
    if (isRedisAvailable && redisClient) {
      try {
        const val = await redisClient.get(key);
        return val;
      } catch (err) {
        console.error('Redis GET error, falling back to local cache:', err);
        isRedisAvailable = false;
      }
    }
    return localCache.get(key);
  },

  async del(key) {
    if (isRedisAvailable && redisClient) {
      try {
        await redisClient.del(key);
        return;
      } catch (err) {
        console.error('Redis DEL error, falling back to local cache:', err);
        isRedisAvailable = false;
      }
    }
    localCache.del(key);
  }
};
