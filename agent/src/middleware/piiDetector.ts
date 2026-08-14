/**
 * PII Detector
 *
 * REDACT_PATTERNS  → dados que NUNCA precisam chegar ao LLM (CPF, CNPJ, cartão).
 *                    São substituídos por [LABEL_REDACTED] na mensagem enviada ao LLM.
 *
 * DETECT_PATTERNS  → dados que o LLM pode precisar (telefone, e-mail).
 *                    Apenas logados/alertados, NÃO removidos da mensagem.
 *                    Ex.: telefone/e-mail são necessários para o tool registrar_lead.
 */

interface RedactionResult {
  /** Texto com PII sensível redactado (vai para o LLM) */
  redacted: string;
  /** Lista de ocorrências encontradas (para alerta/log) */
  found: string[];
}

// CPF/CNPJ exigem formato padrão com pontos e traço — evita falsos positivos
// com números de telefone (que têm 11 dígitos, mas formato diferente).
const REDACT_PATTERNS: { label: string; regex: RegExp }[] = [
  {
    label: "CPF",
    regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
  },
  {
    label: "CNPJ",
    regex: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
  },
  {
    label: "CARTAO",
    // Sequências de 13-16 dígitos com separadores opcionais
    regex: /\b(?:\d[ -]?){15,16}\d\b/g,
  },
];

// Detecta mas NÃO redacta — o LLM precisa desses dados para qualificar e registrar o lead
const DETECT_PATTERNS: { label: string; regex: RegExp }[] = [
  {
    label: "TELEFONE",
    regex: /\b(\+?55\s?)?(\(?\d{2}\)?[\s-]?)(\d{4,5}[\s-]?\d{4})\b/g,
  },
  {
    label: "EMAIL",
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  },
];

export function detectAndRedactPII(text: string): RedactionResult {
  const found: string[] = [];
  let redacted = text;

  // Redacta CPF, CNPJ e cartão
  for (const { label, regex } of REDACT_PATTERNS) {
    regex.lastIndex = 0;
    const matches = text.match(regex);
    if (matches) {
      found.push(...matches.map((m) => `[${label}:${m}]`));
      regex.lastIndex = 0;
      redacted = redacted.replace(regex, `[${label}_REDACTED]`);
    }
  }

  // Apenas detecta telefone e e-mail (sem redactar)
  for (const { label, regex } of DETECT_PATTERNS) {
    regex.lastIndex = 0;
    const matches = text.match(regex);
    if (matches) {
      found.push(...matches.map((m) => `[${label}:${m}]`));
    }
  }

  return { redacted, found };
}

export function hasPII(text: string): boolean {
  const all = [...REDACT_PATTERNS, ...DETECT_PATTERNS];
  return all.some(({ regex }) => {
    regex.lastIndex = 0;
    return regex.test(text);
  });
}
