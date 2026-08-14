import { AgentStateType } from "./state";
import { checkRateLimit } from "../../middleware/rateLimiter";
import { detectAndRedactPII } from "../../middleware/piiDetector";
import { checkEscalation } from "../../middleware/escalation";
import { createAlert } from "../../monitoring/alerting";
import { getSupabaseClient, saveMessage } from "../../monitoring/supabase";
import { getWhatsAppSocket } from "../../whatsapp/client";
import { config } from "../../config";

export async function preprocessNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { sessionId, message } = state;

  // 1. Rate Limiting
  const allowed = await checkRateLimit(sessionId);
  if (!allowed) {
    return { rateLimited: true };
  }

  // 2. PII Detection
  const { redacted, found } = detectAndRedactPII(message);
  if (found.length > 0) {
    await createAlert("pii", sessionId, { found });
  }

  // 2.5. Verificar lock persistente de escalação
  try {
    const supabase = getSupabaseClient();
    const { data: lock } = await supabase
      .from("escalated_sessions")
      .select("session_id, escalated_at, last_msg_at")
      .eq("session_id", sessionId)
      .is("unlocked_at", null)
      .single();

    if (lock) {
      const now = Date.now();
      const THREE_H  = 3 * 60 * 60 * 1000;
      const THIRTY_M = 30 * 60 * 1000;
      const age    = now - new Date(lock.escalated_at).getTime();
      const idleMs = now - new Date(lock.last_msg_at).getTime();

      if (age > THREE_H && idleMs > THIRTY_M) {
        // Auto-unlock — continua para processar normalmente
        await supabase
          .from("escalated_sessions")
          .update({ unlocked_at: new Date().toISOString(), unlocked_by: "auto" })
          .eq("session_id", sessionId);
      } else {
        // Ainda travado: atualiza last_msg_at, salva mensagem e silencia
        await supabase
          .from("escalated_sessions")
          .update({ last_msg_at: new Date().toISOString() })
          .eq("session_id", sessionId);
        try {
          await saveMessage(sessionId, "user", message, found.length > 0);
        } catch { /* não fatal */ }
        return { redactedMessage: redacted, piiFound: found, noReply: true };
      }
    }
  } catch { /* não fatal — se Supabase falhar, continua normalmente */ }

  // 3. Escalation Check (opera sobre a mensagem original, não redactada)
  const escalation = checkEscalation(message);
  if (escalation.shouldEscalate) {
    await createAlert("escalation", sessionId, { reason: escalation.reason, message });

    // Notificação WhatsApp para o time comercial
    try {
      const sock = getWhatsAppSocket();
      const phone = config.WHATSAPP_NOTIFY_PHONE;
      if (sock && phone) {
        const msg =
          `🚨 *Escalação — ${config.BRAND_NAME}*\n\n` +
          `🆔 *Sessão:* ${sessionId}\n` +
          `📋 *Motivo:* ${escalation.reason}\n` +
          `💬 *Mensagem:* ${message}`;
        await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: msg });
      }
    } catch { /* não fatal */ }

    {
      const { error } = await getSupabaseClient()
        .from("escalated_sessions")
        .upsert({
          session_id: sessionId,
          escalated_at: new Date().toISOString(),
          last_msg_at: new Date().toISOString(),
          unlocked_at: null,  // limpa unlock anterior (re-escalação)
          unlocked_by: null,
        });
      if (error) console.error("[preprocess] Falha ao gravar lock de escalação:", error);
    }
    return {
      redactedMessage: redacted,
      piiFound: found,
      escalated: true,
      escalationReason: escalation.reason,
    };
  }

  return {
    redactedMessage: redacted,
    piiFound: found,
  };
}
