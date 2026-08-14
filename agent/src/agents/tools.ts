import { ToolMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { config } from "../config";
import pino from "pino";
import {
  getSupabaseClient,
  saveMessage,
  saveLead,
  upsertSessionMemory,
} from "../monitoring/supabase";
import { getWhatsAppSocket } from "../whatsapp/client";

const logger = pino({ name: "tools" });

// ─── Schemas de validação ─────────────────────────────────────────────────────

export const registrarLeadSchema = z.object({
  perfil: z
    .enum(["provedor_isp", "estabelecimento", "integrador_parceiro"])
    .describe("Perfil do lead conforme segmentação do site"),
  nome: z.string().describe("Nome completo do contato"),
  empresa: z.string().optional().describe("Nome da empresa"),
  email: z.string().optional().describe("E-mail corporativo"),
  telefone: z.string().optional().describe("Telefone/WhatsApp de contato"),
  segmento: z
    .string()
    .optional()
    .describe("Segmento de atuação: hotelaria, varejo/supermercado, restaurante, shopping, saúde, educação, telecom, projeto público/smart city etc."),
  dor_principal: z
    .string()
    .optional()
    .describe("Dor principal: captar leads, cumprir LGPD, reduzir chamados, aumentar vendas, monetizar Wi-Fi etc."),
  possui_infraestrutura: z
    .boolean()
    .optional()
    .describe("Se já possui rede Wi-Fi/equipamentos compatíveis e internet ativa"),
  qtd_pontos: z.number().optional().describe("Quantidade de pontos/unidades/lojas"),
  volume_mensal_estimado: z
    .string()
    .optional()
    .describe("Estimativa de conexões ou visitantes por mês"),
  ferramentas_atuais: z
    .string()
    .optional()
    .describe("Ferramentas já usadas: CRM (RD Station, HubSpot, Pipedrive, Salesforce), ERP/ISP (IXC, TOTVS, GCOM) etc."),
  plano_interesse: z
    .enum(["connect", "marketing", "experience"])
    .optional()
    .describe("Plano de interesse — Connect, Marketing ou Experience"),
  ciclo_pagamento: z.enum(["mensal", "anual"]).optional().describe("Ciclo de pagamento de interesse"),
  prazo_implementacao: z.string().optional().describe("Prazo desejado para implementação"),
  decisor: z.boolean().optional().describe("Se a pessoa é a decisora de compra"),
});

export const escalarAtendimentoSchema = z.object({
  message: z.string().describe("Mensagem original do cliente"),
  context: z
    .string()
    .describe("Resumo do contexto para orientar o atendente humano"),
});

// ─── Definições das tools (formato OpenAI) ───────────────────────────────────
// Passadas ao ChatOpenAI.bindTools() para o LLM saber quando chamá-las.

export const TOOLS_DEFINITION = [
  {
    type: "function" as const,
    function: {
      name: "registrar_lead",
      description:
        "Registra um lead qualificado no CRM e aciona o time comercial. Use SOMENTE depois de ter coletado, ao longo da conversa: perfil (provedor/ISP, estabelecimento ou integrador/parceiro), nome, um jeito de contato (e-mail ou telefone), segmento de atuação, dor principal e uma indicação de orçamento/plano de interesse. Não é preciso ter TODOS os campos — registre com o que tiver de essencial (perfil, nome, contato, dor principal) e preencha o resto se disponível. Chame apenas uma vez por sessão, salvo se o cliente trouxer novas informações relevantes depois de já ter sido registrado.",
      parameters: {
        type: "object",
        properties: {
          perfil: {
            type: "string",
            enum: ["provedor_isp", "estabelecimento", "integrador_parceiro"],
            description: "Perfil do lead",
          },
          nome: { type: "string", description: "Nome completo do contato" },
          empresa: { type: "string", description: "Nome da empresa" },
          email: { type: "string", description: "E-mail corporativo" },
          telefone: { type: "string", description: "Telefone/WhatsApp de contato" },
          segmento: { type: "string", description: "Segmento de atuação" },
          dor_principal: { type: "string", description: "Dor principal do cliente" },
          possui_infraestrutura: { type: "boolean", description: "Já possui rede Wi-Fi/equipamento compatível" },
          qtd_pontos: { type: "number", description: "Quantidade de pontos/unidades" },
          volume_mensal_estimado: { type: "string", description: "Estimativa de conexões/visitantes por mês" },
          ferramentas_atuais: { type: "string", description: "CRM/ERP/ISP já usados" },
          plano_interesse: { type: "string", enum: ["connect", "marketing", "experience"], description: "Plano de interesse" },
          ciclo_pagamento: { type: "string", enum: ["mensal", "anual"], description: "Ciclo de pagamento" },
          prazo_implementacao: { type: "string", description: "Prazo desejado para implementação" },
          decisor: { type: "boolean", description: "Se é o decisor de compra" },
        },
        required: ["perfil", "nome"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "escalar_atendimento",
      description:
        "Encaminha o atendimento para um humano do time comercial/suporte. Use em qualquer um destes casos: (1) o cliente pediu explicitamente para falar com um especialista, vendedor ou humano; (2) o cliente confirmou que quer falar com humano após você admitir que não tem uma informação; (3) reclamação grave ou questão de suporte técnico existente; (4) negociação especial, desconto ou proposta de contrato; (5) o cliente tem interesse no plano Experience (sempre encaminhar direto para vendas).",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Mensagem original do cliente" },
          context: { type: "string", description: "Contexto para orientar o atendente humano" },
        },
        required: ["message", "context"],
      },
    },
  },
];

// ─── Input types — objeto único para traceable (evita bug de args posicionais
// no build compilado onde traceable empacota multi-args como array)

type RegistrarLeadInput = z.infer<typeof registrarLeadSchema> & { sessionId: string };
type EscalarAtendimentoInput = z.infer<typeof escalarAtendimentoSchema> & { sessionId: string };

// Versões rastreadas — recebem um objeto único, aparecem no LangSmith como spans de tool

const PERFIL_LABEL: Record<string, string> = {
  provedor_isp: "Provedor/ISP",
  estabelecimento: "Estabelecimento",
  integrador_parceiro: "Integrador/Parceiro",
};

const tracedRegistrarLead = traceable(
  async ({ sessionId, ...args }: RegistrarLeadInput): Promise<string> => {
    logger.info({ args, sessionId }, "[Tool] registrar_lead");

    // Salvar no banco de leads
    try {
      await saveLead({ session_id: sessionId, ...args });
    } catch (err) {
      logger.error({ err, sessionId }, "[Tool] Falha ao salvar lead no Supabase");
    }

    // Notificação WhatsApp para o time comercial — best effort, não pode travar a tool
    // (sendMessage aguarda ack do WhatsApp; com socket instável isso pode demorar ~60s)
    try {
      const sock = getWhatsAppSocket();
      const phone = config.WHATSAPP_NOTIFY_PHONE?.replace(/\D/g, "");
      if (sock && phone) {
        const msg =
          `🚀 *Novo Lead — ${config.BRAND_NAME}*\n\n` +
          `👤 *Nome:* ${args.nome}\n` +
          (args.empresa ? `🏢 *Empresa:* ${args.empresa}\n` : "") +
          `🏷️ *Perfil:* ${PERFIL_LABEL[args.perfil] ?? args.perfil}\n` +
          (args.segmento ? `📂 *Segmento:* ${args.segmento}\n` : "") +
          (args.dor_principal ? `🎯 *Dor principal:* ${args.dor_principal}\n` : "") +
          (args.plano_interesse ? `📦 *Plano de interesse:* ${args.plano_interesse}\n` : "") +
          (args.email ? `✉️ *E-mail:* ${args.email}\n` : "") +
          (args.telefone ? `📞 *Tel:* ${args.telefone}\n` : "");
        await Promise.race([
          sock.sendMessage(`${phone}@s.whatsapp.net`, { text: msg }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5_000)),
        ]);
      }
    } catch { /* não fatal */ }

    // Marcar na session_memory para evitar re-registro duplicado pelo LLM
    try {
      await upsertSessionMemory(sessionId, { lead_registrado: args });
    } catch { /* não fatal */ }

    // Sumário no histórico — sinaliza ao LLM que o lead já foi registrado
    try {
      await saveMessage(
        sessionId,
        "assistant",
        `[SUMÁRIO] Lead registrado: ${args.nome}${args.empresa ? " (" + args.empresa + ")" : ""} | Perfil: ${PERFIL_LABEL[args.perfil] ?? args.perfil}.`
      );
    } catch { /* não fatal */ }

    return `Lead registrado com sucesso: ${args.nome}. Informe ao cliente que o time comercial da U-all entrará em contato em breve, e pergunte se ele quer agendar uma demonstração ou já pode ser encaminhado para falar com um especialista agora.`;
  },
  { name: "registrar_lead", run_type: "tool" }
);

const tracedEscalarAtendimento = traceable(
  async ({ sessionId, ...args }: EscalarAtendimentoInput): Promise<string> => {
    logger.info({ sessionId }, "[Tool] escalar_atendimento");

    // Gravar lock SEMPRE, independente do resultado do webhook
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
      if (error) logger.error({ error, sessionId }, "[Tool] Falha ao gravar lock de escalação");
    }

    // Webhook: best effort (pode falhar sem impedir o lock)
    try {
      await fetch(config.ESCALATION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...args }),
      });
    } catch { /* não fatal */ }

    // Sumário no histórico — sinaliza ao LLM que escalação está concluída
    try {
      await saveMessage(
        sessionId,
        "assistant",
        "[SUMÁRIO] Escalação registrada. Chat transferido para atendimento humano."
      );
    } catch { /* não fatal */ }

    return "Escalação registrada. Informe ao cliente que um especialista do time comercial entrará em contato em breve.";
  },
  { name: "escalar_atendimento", run_type: "tool" }
);

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  toolCallId: string,
  sessionId: string
): Promise<ToolMessage> {
  try {
    let content: string;

    if (name === "registrar_lead") {
      content = await tracedRegistrarLead({
        sessionId,
        ...registrarLeadSchema.parse(args),
      });
    } else if (name === "escalar_atendimento") {
      content = await tracedEscalarAtendimento({
        sessionId,
        ...escalarAtendimentoSchema.parse(args),
      });
    } else {
      content = `Ferramenta desconhecida: ${name}`;
    }

    return new ToolMessage({ content, tool_call_id: toolCallId });
  } catch (err) {
    logger.error({ err, name }, "[Tool] Erro na execução");
    return new ToolMessage({
      content: "Erro ao executar a ferramenta. Oriente o cliente a entrar em contato.",
      tool_call_id: toolCallId,
    });
  }
}
