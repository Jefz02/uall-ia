import { getSupabaseClient } from "./supabase";
import pino from "pino";

const logger = pino({ name: "alerting" });

export type AlertType = "escalation" | "error" | "rate_limit" | "pii";

export async function createAlert(
  type: AlertType,
  sessionId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  logger.warn({ type, sessionId, payload }, `[ALERT] ${type}`);

  try {
    const { error } = await getSupabaseClient().from("alerts").insert({
      type,
      session_id: sessionId,
      payload,
    });
    if (error) {
      logger.error({ error }, "Falha ao persistir alerta no Supabase");
    }
  } catch (err) {
    logger.error({ err }, "Erro inesperado ao criar alerta");
  }
}
