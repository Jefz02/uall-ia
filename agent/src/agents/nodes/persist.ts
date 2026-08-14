import { AgentStateType } from "./state";
import {
  saveMessage,
  upsertSessionMemory,
} from "../../monitoring/supabase";

/**
 * Extrai memória contextual da conversa (nome, empresa, perfil informado)
 * de forma simples via regex sobre a mensagem do usuário.
 */
function extractMemoryPatches(
  message: string
): Record<string, unknown> {
  const patches: Record<string, unknown> = {};

  const nameMatch = message.match(/(?:meu\s+nome\s+é|me\s+chamo)\s+([A-ZÀ-Ú][a-zà-ú]+)/i);
  if (nameMatch) patches.name = nameMatch[1];

  const companyMatch = message.match(/(?:minha\s+empresa\s+(?:é|se\s+chama)|empresa\s*:)\s*([^.,\n]{2,60})/i);
  if (companyMatch) patches.company = companyMatch[1].trim();

  return patches;
}

export async function persistNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const {
    sessionId,
    message,
    response,
    piiFound,
    escalated,
    blocked,
    rateLimited,
  } = state;

  // Não persiste se foi bloqueado por rate limit
  if (rateLimited) return {};

  const hasPII = piiFound.length > 0;

  // Salva sequencialmente para garantir ordem cronológica correta
  await saveMessage(sessionId, "user", message, hasPII);
  if (response) await saveMessage(sessionId, "assistant", response);

  // Atualiza memória contextual somente em fluxo normal (não escalation/block)
  if (!escalated && !blocked) {
    const patches = extractMemoryPatches(message);
    if (Object.keys(patches).length > 0) {
      await upsertSessionMemory(sessionId, patches);
    }
  }

  return {};
}
