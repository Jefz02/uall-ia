/**
 * Escalation pré-LLM — detecta mensagens que devem ir direto para o time comercial.
 * Regras baseadas em palavras-chave e padrões de frustração/urgência.
 */

import { config } from "../config";

const ESCALATION_KEYWORDS = [
  // reclamações explícitas — bypass direto ao humano, sem passar pelo LLM
  "reclamação",
  "reclamar",
  "quero reclamar",
  "absurdo",
  "inadmissível",
  "inaceitável",
  "péssimo",
  "horrível",
  "um horror",
  "vergonha",
  // negociações e contratos — sempre humano
  "negociação especial",
  "desconto especial",
  "proposta comercial",
  "contrato",
  "fechar contrato",
  "assinar",
  // Nota: pedidos de falar com humano/vendedor ("quero falar com atendente", etc.)
  // NÃO estão aqui — o LLM os trata chamando a tool escalar_atendimento.
];

const FRUSTRATION_PATTERNS = [
  /que\s+(absurdo|vergonha|horror|ridículo)/i,
  /nunca\s+mais\s+(volto|venho|uso)/i,
  /quero\s+(reembolso|devolução|meu\s+dinheiro|cancelar)/i,
  /cobraram?\s+(errado|indevidamente|a\s+mais)/i,
];

export interface EscalationResult {
  shouldEscalate: boolean;
  reason?: string;
}

export function checkEscalation(message: string): EscalationResult {
  const lower = message.toLowerCase();

  for (const keyword of ESCALATION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { shouldEscalate: true, reason: `keyword: "${keyword}"` };
    }
  }

  for (const pattern of FRUSTRATION_PATTERNS) {
    if (pattern.test(message)) {
      return { shouldEscalate: true, reason: `pattern: ${pattern.source}` };
    }
  }

  return { shouldEscalate: false };
}

export function buildEscalationResponse(): string {
  const lines = ["Vou te conectar com um de nossos especialistas comerciais agora mesmo! Um momento, por favor 🙏"];
  if (config.CONTACT_WHATSAPP) lines.push(`\n📱 **WhatsApp direto:** ${config.CONTACT_WHATSAPP}`);
  if (config.CONTACT_EMAIL)    lines.push(`\n✉️ **E-mail:** ${config.CONTACT_EMAIL}`);
  return lines.join("");
}
