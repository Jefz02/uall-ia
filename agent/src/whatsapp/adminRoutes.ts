import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "../config";
import {
  startWhatsApp,
  stopWhatsApp,
  getWhatsAppSocket,
  listConnections,
  getConnection,
  createConnection,
  updateConnectionLabel,
  deleteConnection,
  loadConnectionsFromDB,
} from "./client";
import { getSupabaseClient, saveMessage } from "../monitoring/supabase";

const loginSchema = z.object({
  password: z.string().min(1),
});

const sendMessageSchema = z.object({
  text: z.string().min(1),
});

const createConnectionSchema = z.object({
  label: z.string().min(1).max(100),
});

const updateConnectionSchema = z.object({
  label: z.string().min(1).max(100),
});

export async function adminRoutes(app: FastifyInstance) {
  // Carrega conexões salvas no banco ao iniciar
  await loadConnectionsFromDB();

  // ─── POST /admin/auth — público ───────────────────────────────────────────
  app.post("/auth", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dados inválidos" });
    }

    if (parsed.data.password !== config.ADMIN_PASSWORD) {
      return reply.status(401).send({ error: "Senha incorreta" });
    }

    const token = app.jwt.sign({ role: "admin" }, { expiresIn: "8h" });
    return { token };
  });

  // ─── Rotas protegidas (JWT obrigatório) ───────────────────────────────────
  await app.register(async (protected_scope: FastifyInstance) => {
    protected_scope.addHook(
      "onRequest",
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ error: "Não autorizado" });
        }
      }
    );

    // ─── WhatsApp — gerenciamento de múltiplas conexões ───────────────────

    // GET /admin/whatsapp/connections — lista todas as conexões
    protected_scope.get("/whatsapp/connections", async () => {
      return listConnections();
    });

    // POST /admin/whatsapp/connections — cria nova conexão
    protected_scope.post(
      "/whatsapp/connections",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const parsed = createConnectionSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: "label é obrigatório e deve ter no máximo 100 caracteres" });
        }
        const conn = createConnection(parsed.data.label);
        return reply.status(201).send(conn);
      }
    );

    // PATCH /admin/whatsapp/connections/:id — renomeia conexão
    protected_scope.patch(
      "/whatsapp/connections/:id",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const parsed = updateConnectionSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: "label inválido" });
        }
        const ok = updateConnectionLabel(id, parsed.data.label);
        if (!ok) return reply.status(404).send({ error: "Conexão não encontrada" });
        return { ok: true };
      }
    );

    // DELETE /admin/whatsapp/connections/:id — remove conexão
    protected_scope.delete(
      "/whatsapp/connections/:id",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const ok = await deleteConnection(id);
        if (!ok) return reply.status(404).send({ error: "Conexão não encontrada" });
        return { ok: true };
      }
    );

    // POST /admin/whatsapp/connections/:id/connect — inicia QR flow
    protected_scope.post(
      "/whatsapp/connections/:id/connect",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const conn = getConnection(id);
        if (!conn) return reply.status(404).send({ error: "Conexão não encontrada" });

        if (conn.status === "connected" || conn.status === "connecting" || conn.status === "qr") {
          return reply.status(409).send({
            error: `Conexão já está ${conn.status === "connected" ? "conectada" : "em processo de conexão"}`,
          });
        }

        startWhatsApp(id).catch((err) => {
          request.log.error({ err, id }, "Erro ao iniciar WhatsApp via admin");
        });

        return { ok: true, message: "Conexão iniciada" };
      }
    );

    // POST /admin/whatsapp/connections/:id/disconnect — desconecta
    protected_scope.post(
      "/whatsapp/connections/:id/disconnect",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const conn = getConnection(id);
        if (!conn) return reply.status(404).send({ error: "Conexão não encontrada" });

        if (conn.status === "disconnected") {
          return reply.status(409).send({ error: "Conexão já está desconectada" });
        }

        await stopWhatsApp(id);
        return { ok: true, message: "Desconectado com sucesso" };
      }
    );

    // ─── Contatos / histórico ─────────────────────────────────────────────

    // GET /admin/contacts — lista todos os contatos com nome e status de lock
    protected_scope.get("/contacts", async () => {
      const supabase = getSupabaseClient();

      const [{ data: memories }, { data: locked }] = await Promise.all([
        supabase
          .from("session_memory")
          .select("session_id, data, updated_at")
          .order("updated_at", { ascending: false }),
        supabase
          .from("escalated_sessions")
          .select("session_id, escalated_at")
          .is("unlocked_at", null),
      ]);

      const lockedSet = new Set(
        (locked ?? []).map((l: { session_id: string }) => l.session_id)
      );

      const contacts = (memories ?? []).map(
        (s: { session_id: string; data: unknown; updated_at: string }) => ({
          session_id: s.session_id,
          name: (s.data as Record<string, unknown>)?.name as string | null ?? null,
          phone: (s.data as Record<string, unknown>)?.whatsapp_phone as string | null ?? null,
          is_locked: lockedSet.has(s.session_id),
          updated_at: s.updated_at,
        })
      );

      // Adicionar sessões escaladas que não estão na session_memory
      const contactIds = new Set(contacts.map((c: { session_id: string }) => c.session_id));
      const extra = (locked ?? [])
        .filter((l: { session_id: string; escalated_at: string }) => !contactIds.has(l.session_id))
        .map((l: { session_id: string; escalated_at: string }) => ({
          session_id: l.session_id,
          name: null,
          phone: null,
          is_locked: true,
          updated_at: l.escalated_at,
        }));

      return [...contacts, ...extra];
    });

    // GET /admin/contacts/:sessionId/messages
    protected_scope.get(
      "/contacts/:sessionId/messages",
      async (request: FastifyRequest) => {
        const { sessionId } = request.params as { sessionId: string };
        const { data } = await getSupabaseClient()
          .from("conversations")
          .select("role, content, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .limit(100);
        return data ?? [];
      }
    );

    // POST /admin/contacts/:sessionId/send — envia mensagem WA como admin
    protected_scope.post(
      "/contacts/:sessionId/send",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { sessionId } = request.params as { sessionId: string };
        const parsed = sendMessageSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: "text é obrigatório" });
        }

        if (!sessionId.startsWith("wa_")) {
          return reply.status(400).send({ error: "Sessão não é WhatsApp" });
        }

        const sock = getWhatsAppSocket();
        if (!sock) {
          return reply.status(503).send({ error: "Nenhum WhatsApp conectado" });
        }

        const phone = sessionId.replace(/^wa_/, "");
        await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: parsed.data.text });
        await saveMessage(sessionId, "assistant", parsed.data.text);

        return { ok: true };
      }
    );

    // ─── Sessões escaladas ────────────────────────────────────────────────

    // GET /admin/conversations (mantido para compatibilidade)
    protected_scope.get("/conversations", async () => {
      const { data } = await getSupabaseClient()
        .from("escalated_sessions")
        .select("session_id, escalated_at, last_msg_at")
        .is("unlocked_at", null)
        .order("escalated_at", { ascending: false });
      return data ?? [];
    });

    // POST /admin/conversations/:sessionId/unlock
    protected_scope.post(
      "/conversations/:sessionId/unlock",
      { config: { rawBody: false } },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { sessionId } = request.params as { sessionId: string };
        const { error } = await getSupabaseClient()
          .from("escalated_sessions")
          .update({ unlocked_at: new Date().toISOString(), unlocked_by: "admin" })
          .eq("session_id", sessionId)
          .is("unlocked_at", null);
        if (error) return reply.status(500).send({ error: "Falha ao desbloquear" });

        try {
          await saveMessage(
            sessionId,
            "assistant",
            "[SUMÁRIO] Atendimento humano encerrado. Retomando assistência virtual."
          );
        } catch { /* não fatal */ }

        return { ok: true };
      }
    );

    // POST /admin/conversations/:sessionId/lock
    protected_scope.post(
      "/conversations/:sessionId/lock",
      { config: { rawBody: false } },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { sessionId } = request.params as { sessionId: string };
        const now = new Date().toISOString();
        const { error } = await getSupabaseClient()
          .from("escalated_sessions")
          .upsert({ session_id: sessionId, escalated_at: now, last_msg_at: now, unlocked_at: null, unlocked_by: null });
        if (error) return reply.status(500).send({ error: "Falha ao bloquear" });
        return { ok: true };
      }
    );

    // ─── Leads ──────────────────────────────────────────────────────────────

    // GET /admin/leads
    protected_scope.get("/leads", async () => {
      const { data } = await getSupabaseClient()
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    });

    // POST /admin/leads/:id/status — atualiza status do lead (ex: contatado, ganho, perdido)
    protected_scope.post(
      "/leads/:id/status",
      { config: { rawBody: false } },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const { status } = request.body as { status: string };
        if (!status) return reply.status(400).send({ error: "status é obrigatório" });
        const { error } = await getSupabaseClient()
          .from("leads")
          .update({ status })
          .eq("id", Number(id));
        if (error) return reply.status(500).send({ error: "Falha ao atualizar status do lead" });
        return { ok: true };
      }
    );
  });
}
