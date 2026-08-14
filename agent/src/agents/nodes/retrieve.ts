import { AgentStateType } from "./state";
import { retrieveContext } from "../rag";
import {
  getConversationHistory,
  getSessionMemory,
} from "../../monitoring/supabase";

export async function retrieveNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { sessionId, redactedMessage, message } = state;
  const query = redactedMessage || message;

  const [ragContext, history, sessionMemory] = await Promise.all([
    retrieveContext(query, 6),
    getConversationHistory(sessionId, 10),
    getSessionMemory(sessionId),
  ]);

  return { ragContext, history, sessionMemory };
}
