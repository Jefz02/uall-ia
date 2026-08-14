import "dotenv/config";
import pino from "pino";
import { config } from "./config";
import { startServer } from "./server";
import { closeRedis } from "./cache/responseCache";
import { runIngest } from "./agents/ingest";

const logger = pino({ name: "main" });

async function main() {
  logger.info("Iniciando Agente de Qualificação de Leads — U-all IA");

  // Indexa documentos RAG ao iniciar — garante que o Supabase pgvector está atualizado
  try {
    const { chunks, sources } = await runIngest();
    logger.info({ chunks, sources }, "RAG indexado com sucesso");
  } catch (err) {
    // Não bloqueia o servidor — se Supabase estiver indisponível, continua sem RAG
    logger.warn({ err }, "Falha ao indexar RAG no startup — continuando sem RAG");
  }

  // Inicia servidor REST (Fastify)
  await startServer();

  // Conexões WhatsApp são gerenciadas pelo painel admin — não há auto-start aqui
}

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, "Encerrando serviços...");
  await closeRedis();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  logger.error({ err }, "Erro fatal ao inicializar");
  process.exit(1);
});
