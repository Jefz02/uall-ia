import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { Server } from "socket.io";
import axios from "axios";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:3000";
const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ─── Server setup ─────────────────────────────────────────────────────────────

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// ─── REST endpoints (tool webhooks) ───────────────────────────────────────────

httpServer.on("request", async (req: IncomingMessage, res: ServerResponse) => {
  // Let socket.io handle its own polling requests
  if (req.url?.startsWith("/socket.io")) return;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /tools/lead — disparado pela tool registrar_lead do agente
  if (req.method === "POST" && req.url === "/tools/lead") {
    const body = await readBody(req);
    const { sessionId, nome, plano_interesse } = body as {
      sessionId?: string;
      nome?: string;
      plano_interesse?: string;
    };

    if (!sessionId) {
      json(res, 400, { error: "sessionId é obrigatório" });
      return;
    }

    const message = `Lead registrado${nome ? ` — ${nome}` : ""}${plano_interesse ? ` (interesse: ${plano_interesse})` : ""} 🚀`;

    io.to(sessionId).emit("toast", { type: "lead", message });
    console.log(`[tools/lead] → session "${sessionId}": ${message}`);

    json(res, 200, { ok: true });
    return;
  }

  // POST /tools/escalation
  if (req.method === "POST" && req.url === "/tools/escalation") {
    const body = await readBody(req);
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId) {
      json(res, 400, { error: "sessionId é obrigatório" });
      return;
    }

    io.to(sessionId).emit("toast", {
      type: "escalation",
      message: "Um especialista comercial irá falar com você em breve.",
    });
    console.log(`[tools/escalation] → session "${sessionId}"`);

    json(res, 200, { ok: true });
    return;
  }

  json(res, 404, { error: "Not found" });
});

// ─── Socket.IO events ─────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);

  // Client registers its sessionId so webhooks can target it via room
  socket.on("join", ({ sessionId }: { sessionId: string }) => {
    if (!sessionId) return;
    socket.join(sessionId);
    console.log(`[socket] ${socket.id} joined room "${sessionId}"`);
  });

  socket.on(
    "send_message",
    async ({ sessionId, message }: { sessionId: string; message: string }) => {
      if (!sessionId || !message) {
        socket.emit("error", { message: "sessionId e message são obrigatórios." });
        return;
      }

      socket.emit("typing", { isTyping: true });

      try {
        const { data } = await axios.post<{ sessionId: string; response: string }>(
          `${AGENT_URL}/chat`,
          { sessionId, message },
          { timeout: 30_000 }
        );

        socket.emit("typing", { isTyping: false });
        socket.emit("receive_message", {
          sessionId: data.sessionId,
          response: data.response,
        });
      } catch (err) {
        socket.emit("typing", { isTyping: false });

        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        console.error(
          `[socket] agent error (status=${status}):`,
          err instanceof Error ? err.message : err
        );

        socket.emit("error", {
          message:
            status === 429
              ? "Muitas mensagens em pouco tempo. Aguarde um momento. 🚀"
              : "Desculpe, tive um problema para responder. Tente novamente.",
        });
      }
    }
  );

  socket.on("disconnect", () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[socket] server running on port ${PORT}`);
  console.log(`[socket] agent URL: ${AGENT_URL}`);
  console.log(`[socket] tools: POST /tools/lead | POST /tools/escalation`);
});
