import { AgentStateType } from "./state";
import { validateOutput } from "../../middleware/guardrails";
import { createAlert } from "../../monitoring/alerting";

export async function guardrailsOutputNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { response, sessionId } = state;
  const { valid, sanitized } = validateOutput(response);

  if (!valid) {
    await createAlert("error", sessionId, {
      reason: "output_guardrail_failed",
      original: response,
    });
  }

  return { response: sanitized };
}
