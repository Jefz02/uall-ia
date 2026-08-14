import { StateGraph, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./nodes/state";
import { preprocessNode } from "./nodes/preprocess";
import { guardrailsInputNode } from "./nodes/guardrailsInput";
import { retrieveNode } from "./nodes/retrieve";
import { llmNode } from "./nodes/llm";
import { guardrailsOutputNode } from "./nodes/guardrailsOutput";
import { persistNode } from "./nodes/persist";
import {
  buildEscalationResponse,
} from "../middleware/escalation";
import { BLOCKED_RESPONSE } from "../middleware/guardrails";

// ─── Nós especiais de resposta rápida ────────────────────────────────────────

async function rateLimitResponseNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  return {
    response:
      "Você está enviando muitas mensagens! Aguarde um momentinho antes de continuar 😅",
  };
}

async function escalationResponseNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  return { response: buildEscalationResponse() };
}

async function noReplyNode(
  _state: AgentStateType
): Promise<Partial<AgentStateType>> {
  return {}; // sessão travada — sem resposta, sem persist
}

async function blockedResponseNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  return { response: BLOCKED_RESPONSE };
}

// ─── Roteadores condicionais ─────────────────────────────────────────────────

function routeAfterPreprocess(state: AgentStateType): string {
  if (state.noReply)     return "no_reply";
  if (state.rateLimited) return "rate_limit_response";
  if (state.escalated)   return "escalation_response";
  return "guardrails_input";
}

function routeAfterGuardrailsInput(state: AgentStateType): string {
  if (state.blocked) return "blocked_response";
  return "retrieve";
}

// ─── Construção do grafo ──────────────────────────────────────────────────────

export function buildGraph() {
  const graph = new StateGraph(AgentState)
    // Nós de processamento
    .addNode("preprocess", preprocessNode)
    .addNode("guardrails_input", guardrailsInputNode)
    .addNode("retrieve", retrieveNode)
    .addNode("llm", llmNode)
    .addNode("guardrails_output", guardrailsOutputNode)
    .addNode("persist", persistNode)
    // Nós de resposta rápida (bypasses)
    .addNode("no_reply", noReplyNode)
    .addNode("rate_limit_response", rateLimitResponseNode)
    .addNode("escalation_response", escalationResponseNode)
    .addNode("blocked_response", blockedResponseNode)
    // Entry point
    .addEdge("__start__", "preprocess")
    // Edges condicionais
    .addConditionalEdges("preprocess", routeAfterPreprocess, {
      no_reply:            "no_reply",
      rate_limit_response: "rate_limit_response",
      escalation_response: "escalation_response",
      guardrails_input:    "guardrails_input",
    })
    .addConditionalEdges("guardrails_input", routeAfterGuardrailsInput, {
      blocked_response: "blocked_response",
      retrieve: "retrieve",
    })
    // Edges lineares
    .addEdge("retrieve", "llm")
    .addEdge("llm", "guardrails_output")
    .addEdge("guardrails_output", "persist")
    // Todos os fins → END
    .addEdge("persist", END)
    .addEdge("no_reply", END)
    .addEdge("rate_limit_response", END)
    .addEdge("escalation_response", "persist")
    .addEdge("blocked_response", END);

  return graph.compile();
}

// Singleton compilado
let _compiledGraph: ReturnType<typeof buildGraph> | null = null;

export function getGraph() {
  if (!_compiledGraph) {
    _compiledGraph = buildGraph();
  }
  return _compiledGraph;
}

// ─── Interface pública ────────────────────────────────────────────────────────

export async function processMessage(
  sessionId: string,
  message: string
): Promise<string | null> {
  const graph = getGraph();

  const result = await graph.invoke({
    sessionId,
    message,
  });

  if (result.noReply) return null;
  return result.response || "Opa, algo deu errado. Tente novamente! 😅";
}
