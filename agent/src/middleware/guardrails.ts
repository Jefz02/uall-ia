/**
 * GuardRails de entrada e saída.
 *
 * Input:  bloqueia conteúdo impróprio ou completamente fora de escopo.
 * Output: garante que a resposta está no escopo do atendimento comercial da U-all.
 */

// ─── Input Guardrails ─────────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  // conteúdo ofensivo / discurso de ódio
  /palavrão|xingamento|palavrao/i,
  /\b(idiota|imbecil|cretino|merda|porra|caralho|fdp|viado)\b/i,
  // tentativas de prompt injection
  /ignore (previous|all|your|the) (instructions?|prompts?|context)/i,
  /system\s*prompt|jailbreak|dan mode|ignore tudo/i,
  // pedidos completamente fora de escopo comercial
  /me (ensine|explique|programe|escreva) (código|programa|script|hack)/i,
];

export interface InputGuardResult {
  blocked: boolean;
  reason?: string;
}

export function checkInputGuardrails(message: string): InputGuardResult {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(message)) {
      return { blocked: true, reason: `pattern: ${pattern.source}` };
    }
  }

  // Mensagem muito curta não tem como ser relevante
  if (message.trim().length < 2) {
    return { blocked: true, reason: "mensagem muito curta" };
  }

  return { blocked: false };
}

export const BLOCKED_RESPONSE =
  "Opa, não consegui entender sua mensagem ou ela está fora do que posso ajudar aqui 😅\n" +
  "Estou aqui para te ajudar a entender as soluções de Wi-Fi Marketing da U-all Solutions e te conectar com o time certo!";

// ─── Output Guardrails ────────────────────────────────────────────────────────

/**
 * Valida se a resposta gerada pelo LLM é aceitável.
 * Em caso de falha retorna uma mensagem de fallback segura.
 */
export function validateOutput(response: string): {
  valid: boolean;
  sanitized: string;
} {
  // Resposta vazia ou muito curta — fallback
  if (!response || response.trim().length < 10) {
    return {
      valid: false,
      sanitized:
        "Eita, não consegui formular uma resposta agora 😅 Tente novamente em instantes!",
    };
  }

  // Remove qualquer tentativa do modelo de imprimir dados internos
  const sanitized = response
    .replace(/system prompt[:\s]/gi, "")
    .replace(/\[INST\]|\[\/INST\]/g, "")
    .replace(/<\|.*?\|>/g, "")
    .trim();

  return { valid: true, sanitized };
}
