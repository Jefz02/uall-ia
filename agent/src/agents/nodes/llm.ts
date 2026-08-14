import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
  AIMessageChunk,
} from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { readFileSync } from "fs";
import { join } from "path";
import { AgentStateType } from "./state";
import { config } from "../../config";
import { TOOLS_DEFINITION, executeTool } from "../tools";

const SYSTEM_PROMPT = readFileSync(
  join(__dirname, "../systemPrompts/systemPrompt.md"),
  "utf-8"
);

function getBrasiliaContext(): string {
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { timeZone: "America/Sao_Paulo" };
  const date = now.toLocaleDateString("pt-BR", {
    ...opts,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("pt-BR", {
    ...opts,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `**Data:** ${date}\n**Hora:** ${time} (Horário de Brasília)`;
}

export async function llmNode(
  state: AgentStateType,
  runConfig?: RunnableConfig
): Promise<Partial<AgentStateType>> {
  const { redactedMessage, message, ragContext, history, sessionMemory, sessionId } =
    state;
  const userMessage = redactedMessage || message;
  const isFirstMessage = history.length === 0;

  const systemContent = [
    SYSTEM_PROMPT,
    `\n\n## Data e hora atual\n${getBrasiliaContext()}`,
    !isFirstMessage
      ? "\n\n> INSTRUÇÃO: Esta NÃO é a primeira mensagem da conversa. NÃO use a saudação inicial com o nome da marca nem o emoji de abertura. Continue a conversa de forma natural."
      : "",
    ragContext
      ? `\n\n## Informações relevantes da base de conhecimento U-all:\n${ragContext}`
      : "",
    Object.keys(sessionMemory).length > 0
      ? `\n\n## Memória da sessão do lead:\n${JSON.stringify(sessionMemory, null, 2)}`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const messages: BaseMessage[] = [
    new SystemMessage(systemContent),
    ...history.map((m) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content)
    ),
    new HumanMessage(userMessage),
  ];

  const llm = new ChatOpenAI({
    model: config.OPENAI_MODEL,
    openAIApiKey: config.OPENAI_API_KEY,
    temperature: 0.7,
    maxTokens: 512,
  }).bindTools(TOOLS_DEFINITION);

  // ─── Agentic loop ──────────────────────────────────────────────────────────
  // runConfig propaga o contexto de run do LangGraph → LangSmith traça corretamente
  let result: AIMessageChunk = await llm.invoke(messages, runConfig);
  const allMessages: BaseMessage[] = [...messages, result];

  while (result.tool_calls && result.tool_calls.length > 0) {
    for (const call of result.tool_calls) {
      console.log(
        `\n[TOOL CALL] ${call.name}\n` +
        `  sessionId : ${sessionId}\n` +
        `  args      : ${JSON.stringify(call.args, null, 2)}`
      );
    }

    const toolResults = await Promise.all(
      result.tool_calls.map((call) =>
        executeTool(
          call.name,
          call.args as Record<string, unknown>,
          call.id!,
          sessionId
        )
      )
    );

    for (const tr of toolResults) {
      console.log(`[TOOL RESULT] ${String(tr.content)}\n`);
    }

    allMessages.push(...toolResults);
    result = await llm.invoke(allMessages, runConfig);
    allMessages.push(result);
  }

  const response =
    typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);

  return { response };
}
