import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { z } from "zod";
import { config } from "./config";
import { processMessage } from "./agents/graph";
import { runIngest } from "./agents/ingest";
import { adminRoutes } from "./whatsapp/adminRoutes";

const chatBodySchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.ADMIN_JWT_SECRET });
  await app.register(adminRoutes, { prefix: "/admin" });

  // ─── Health Check ──────────────────────────────────────────────────────────
  app.get("/health", async () => ({ status: "ok", service: "uall-ia-agent" }));

  // ─── Sync RAG ──────────────────────────────────────────────────────────────
  // Reindexar documentos sem reiniciar o container
  // Uso: POST /sync  (sem body)
  app.post("/sync", async (request, reply) => {
    request.log.info("Sincronização RAG solicitada via /sync");
    try {
      const result = await runIngest();
      return { ok: true, ...result };
    } catch (err) {
      request.log.error({ err }, "Erro na sincronização RAG");
      return reply.status(500).send({ ok: false, error: "Falha na sincronização" });
    }
  });

  // ─── Chat Endpoint ─────────────────────────────────────────────────────────
  app.post("/chat", async (request, reply) => {
    const parsed = chatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Dados inválidos", details: parsed.error.flatten() });
    }

    const { sessionId, message } = parsed.data;

    try {
      const response = await processMessage(sessionId, message);
      return { sessionId, response };
    } catch (err) {
      request.log.error({ err }, "Erro ao processar mensagem");
      return reply.status(500).send({ error: "Erro interno do servidor" });
    }
  });

  return app;
}

export async function startServer() {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`Servidor Fastify escutando na porta ${config.PORT}`);
  return app;
}
