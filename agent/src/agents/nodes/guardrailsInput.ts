import { AgentStateType } from "./state";
import { checkInputGuardrails } from "../../middleware/guardrails";

export async function guardrailsInputNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { redactedMessage } = state;
  const result = checkInputGuardrails(redactedMessage || state.message);

  if (result.blocked) {
    return { blocked: true };
  }

  return {};
}
