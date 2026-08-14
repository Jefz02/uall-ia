import { Annotation } from "@langchain/langgraph";

// Reducer simples: substitui sempre pelo valor mais recente
const replace = <T>(_: T, next: T): T => next;

export const AgentState = Annotation.Root({
  sessionId: Annotation<string>(),
  message: Annotation<string>(),
  redactedMessage: Annotation<string>({ value: replace, default: () => "" }),
  piiFound: Annotation<string[]>({ value: replace, default: () => [] }),
  rateLimited: Annotation<boolean>({ value: replace, default: () => false }),
  escalated: Annotation<boolean>({ value: replace, default: () => false }),
  noReply: Annotation<boolean>({ value: replace, default: () => false }),
  escalationReason: Annotation<string | undefined>({ value: replace, default: () => undefined }),
  blocked: Annotation<boolean>({ value: replace, default: () => false }),
  ragContext: Annotation<string>({ value: replace, default: () => "" }),
  history: Annotation<{ role: "user" | "assistant"; content: string }[]>({
    value: replace,
    default: () => [],
  }),
  sessionMemory: Annotation<Record<string, unknown>>({ value: replace, default: () => ({}) }),
  response: Annotation<string>({ value: replace, default: () => "" }),
});

export type AgentStateType = typeof AgentState.State;
