import Redis from "ioredis";
import { config } from "../config";

let _redis: Redis | null = null;
let _redisErrorLogged = false;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    _redis.on("error", (err) => {
      if (!_redisErrorLogged) {
        console.warn(
          `[Redis] Indisponível (${err.message}).\n` +
          `[Redis] Para uso local, defina REDIS_URL=redis://localhost:6379 no .env`
        );
        _redisErrorLogged = true;
      }
    });
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
