import { processMessage } from "../agents/graph";
import { toWhatsAppMarkdown } from "./formatMarkdown";
import { upsertSessionMemory } from "../monitoring/supabase";

/**
 * Converte o JID do WhatsApp em sessionId.
 * Ex.: "5511999991234@s.whatsapp.net" → "wa_5511999991234"
 */
function jidToSessionId(jid: string): string {
  return `wa_${jid.replace(/@.*$/, "")}`;
}

export async function handleWhatsAppMessage(
  from: string,
  text: string,
  contact: { name: string | null; phone: string }
): Promise<string | null> {
  const sessionId = jidToSessionId(from);

  // Pré-salva nome e telefone do WhatsApp na memória da sessão
  // para que o LLM possa pré-preencher o lead sem pedir de novo ao cliente.
  const memPatch: Record<string, unknown> = { whatsapp_phone: contact.phone };
  if (contact.name) memPatch.name = contact.name;
  try {
    await upsertSessionMemory(sessionId, memPatch);
  } catch { /* não bloqueia */ }

  const raw = await processMessage(sessionId, text);
  if (raw === null) return null; // sessão travada — sem resposta
  return toWhatsAppMarkdown(raw);
}
