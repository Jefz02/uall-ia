import { getRedis } from "../cache/responseCache";
import { config } from "../config";
import { createAlert } from "../monitoring/alerting";

/**
 * Sliding-window rate limiter usando Redis ZADD.
 * Retorna true se o cliente passou no limite, false se foi bloqueado.
 */
export async function checkRateLimit(sessionId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `rl:${sessionId}`;
  const now = Date.now();
  const windowStart = now - config.RATE_LIMIT_WINDOW_MS;

  try {
    const pipeline = redis.pipeline();
    // Remove entradas fora da janela
    pipeline.zremrangebyscore(key, 0, windowStart);
    // Conta entradas na janela
    pipeline.zcard(key);
    // Adiciona a entrada atual
    pipeline.zadd(key, now, `${now}`);
    // Define TTL
    pipeline.expire(key, Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000) + 5);

    const results = await pipeline.exec();
    const count = (results?.[1]?.[1] as number) ?? 0;

    if (count >= config.RATE_LIMIT_MAX_MESSAGES) {
      await createAlert("rate_limit", sessionId, {
        count,
        max: config.RATE_LIMIT_MAX_MESSAGES,
      });
      return false;
    }
    return true;
  } catch {
    // Em caso de falha no Redis, deixa passar (fail open)
    return true;
  }
}
