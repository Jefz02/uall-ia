import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
} from "whaileys";
import { Boom } from "@hapi/boom";
import { join } from "path";
import * as fs from "fs";
import { randomUUID, randomBytes, createCipheriv, createDecipheriv, createHash } from "crypto";
import pino from "pino";
import { handleWhatsAppMessage } from "./handler";
import { isAudioMessage, transcribeAudio } from "./transcribeAudio";
import { getSupabaseClient } from "../monitoring/supabase";
import { config } from "../config";

const logger = pino({ name: "whatsapp" });
const SESSIONS_BASE = join(process.cwd(), "data/whatsapp-session");

// ─── Criptografia da sessão (credenciais Baileys persistidas no banco) ────────
// O disco local é efêmero (container reinicia/redeploya e perde tudo), então a
// sessão precisa sobreviver no Supabase.

const ENC_KEY = createHash("sha256")
  .update(Buffer.from(config.WA_SESSION_ENCRYPTION_KEY, "hex"))
  .digest();

function encrypt(data: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(data: string): string {
  const buf = Buffer.from(data, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final("utf8");
}

/** Lê os arquivos de credencial do disco e persiste (criptografados) no banco. */
async function persistSessionFiles(id: string, sessionPath: string): Promise<void> {
  try {
    const files: Record<string, unknown> = {};
    for (const f of fs.readdirSync(sessionPath)) {
      try {
        files[f] = JSON.parse(fs.readFileSync(join(sessionPath, f), "utf8"));
      } catch {
        // não é JSON de credencial — ignora
      }
    }
    if (Object.keys(files).length === 0) return;
    const encrypted = encrypt(JSON.stringify(files));
    await getSupabaseClient()
      .from("whatsapp_connections")
      .update({ session_data: encrypted })
      .eq("id", id);
  } catch (err) {
    logger.warn({ err, id }, "Falha ao persistir sessão WhatsApp no banco");
  }
}

/** Restaura os arquivos de credencial do banco para o disco, se existirem. */
async function restoreSessionFiles(id: string, sessionPath: string): Promise<boolean> {
  try {
    const { data } = await getSupabaseClient()
      .from("whatsapp_connections")
      .select("session_data")
      .eq("id", id)
      .single();
    if (!data?.session_data) return false;

    const decrypted = decrypt(data.session_data as string);
    const files = JSON.parse(decrypted) as Record<string, unknown>;
    fs.mkdirSync(sessionPath, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      fs.writeFileSync(join(sessionPath, filename), JSON.stringify(content));
    }
    logger.info({ id }, "Sessão WhatsApp restaurada do banco de dados");
    return true;
  } catch (err) {
    logger.warn({ err, id }, "Falha ao restaurar sessão WhatsApp do banco (não fatal)");
    return false;
  }
}

/** Remove credenciais persistidas (usado em logout/desconexão definitiva). */
async function clearSessionFiles(id: string, sessionPath: string): Promise<void> {
  try {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  } catch {
    // diretório pode já não existir
  }
  try {
    await getSupabaseClient()
      .from("whatsapp_connections")
      .update({ session_data: null })
      .eq("id", id);
  } catch (err) {
    logger.warn({ err, id }, "Falha ao limpar sessão WhatsApp no banco");
  }
}

// Deduplicação de mensagens — evita processar o mesmo msgId duas vezes
const _processedIds = new Set<string>();
function markProcessed(id: string): boolean {
  if (_processedIds.has(id)) return false;
  _processedIds.add(id);
  setTimeout(() => _processedIds.delete(id), 5 * 60 * 1_000);
  return true;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhatsAppStatus = "disconnected" | "connecting" | "qr" | "connected";

export interface ConnectionInfo {
  id: string;
  label: string;
  status: WhatsAppStatus;
  qr: string | null;
  phone: string | null;
}

interface ConnectionState extends ConnectionInfo {
  sock: WASocket | null;
}

// ─── In-memory state ──────────────────────────────────────────────────────────

const _connections = new Map<string, ConnectionState>();
let _dbLoaded = false;

// ─── Public API ───────────────────────────────────────────────────────────────

export function listConnections(): ConnectionInfo[] {
  return Array.from(_connections.values()).map(({ sock: _s, ...info }) => info);
}

export function getConnection(id: string): ConnectionInfo | null {
  const conn = _connections.get(id);
  if (!conn) return null;
  const { sock: _s, ...info } = conn;
  return info;
}

export function createConnection(label: string): ConnectionInfo {
  const id = randomUUID();
  const conn: ConnectionState = {
    id,
    label,
    status: "disconnected",
    qr: null,
    phone: null,
    sock: null,
  };
  _connections.set(id, conn);
  void persistConnection(conn);
  logger.info({ id, label }, "Nova conexão WhatsApp criada");
  return { id, label, status: "disconnected", qr: null, phone: null };
}

export function updateConnectionLabel(id: string, label: string): boolean {
  const conn = _connections.get(id);
  if (!conn) return false;
  conn.label = label;
  void persistConnection(conn);
  return true;
}

export async function deleteConnection(id: string): Promise<boolean> {
  const conn = _connections.get(id);
  if (!conn) return false;

  // Desconecta o socket se estiver ativo
  if (conn.sock) {
    try {
      await conn.sock.logout();
    } catch {
      // Socket pode já estar fechado
    }
    conn.sock = null;
  }

  _connections.delete(id);

  try {
    fs.rmSync(join(SESSIONS_BASE, id), { recursive: true, force: true });
  } catch {
    // diretório pode já não existir
  }

  try {
    await getSupabaseClient().from("whatsapp_connections").delete().eq("id", id);
  } catch (err) {
    logger.warn({ err }, "Falha ao deletar conexão do Supabase (não fatal)");
  }

  logger.info({ id }, "Conexão WhatsApp deletada");
  return true;
}

// ─── Backward-compat getters (usados em adminRoutes legado) ──────────────────

export function getWhatsAppSocket(): WASocket | null {
  for (const conn of _connections.values()) {
    if (conn.sock && conn.status === "connected") return conn.sock;
  }
  return null;
}

export function getWhatsAppStatus(): WhatsAppStatus {
  const first = _connections.values().next().value as ConnectionState | undefined;
  return first?.status ?? "disconnected";
}

export function getCurrentQR(): string | null {
  for (const conn of _connections.values()) {
    if (conn.qr) return conn.qr;
  }
  return null;
}

export function getConnectedPhone(): string | null {
  for (const conn of _connections.values()) {
    if (conn.phone) return conn.phone;
  }
  return null;
}

// ─── Supabase persistence ─────────────────────────────────────────────────────

async function persistConnection(conn: ConnectionState): Promise<void> {
  try {
    await getSupabaseClient()
      .from("whatsapp_connections")
      .upsert({
        id: conn.id,
        label: conn.label,
        status: conn.status,
        phone: conn.phone,
        updated_at: new Date().toISOString(),
      });
  } catch (err) {
    logger.warn({ err }, "Falha ao persistir conexão no Supabase (não fatal)");
  }
}

// ─── Load connections from DB on startup ──────────────────────────────────────

export async function loadConnectionsFromDB(): Promise<void> {
  if (_dbLoaded) return;
  _dbLoaded = true;

  try {
    const { data } = await getSupabaseClient()
      .from("whatsapp_connections")
      .select("id, label, status, phone, session_data")
      .order("updated_at", { ascending: true });

    if (!data || data.length === 0) return;

    for (const row of data) {
      if (!_connections.has(row.id)) {
        _connections.set(row.id, {
          id: row.id,
          label: row.label ?? "Conexão",
          status: "disconnected",
          qr: null,
          phone: null,
          sock: null,
        });
      }
    }

    logger.info({ count: data.length }, "Conexões carregadas do banco de dados");

    // Reconecta automaticamente as conexões que têm sessão salva — sem isso
    // toda conexão exigiria escanear QR de novo a cada restart/redeploy.
    for (const row of data as Array<{ id: string; session_data: string | null }>) {
      if (row.session_data) {
        startWhatsApp(row.id).catch((err) =>
          logger.error({ err, id: row.id }, "Erro ao restaurar conexão WhatsApp")
        );
      }
    }
  } catch (err) {
    logger.warn({ err }, "Falha ao carregar conexões do banco de dados");
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

export async function startWhatsApp(id: string): Promise<WASocket> {
  const conn = _connections.get(id);
  if (!conn) throw new Error(`Conexão ${id} não encontrada`);

  conn.status = "connecting";
  conn.qr = null;
  conn.phone = null;
  void persistConnection(conn);

  const sessionPath = join(SESSIONS_BASE, id);
  // Só restaura do banco se o disco local estiver vazio (container novo/redeploy).
  // Em reconexões dentro do mesmo processo o disco já é a fonte da verdade —
  // sobrescrever com uma cópia do banco pode pegar um snapshot desatualizado
  // (persistSessionFiles é assíncrono) e corromper as chaves de sessão.
  const hasLocalSession =
    fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
  if (!hasLocalSession) {
    await restoreSessionFiles(id, sessionPath);
  }
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  // Versão do protocolo WA muda periodicamente do lado do servidor — buscar
  // dinamicamente evita o socket travar em "connecting" sem nunca emitir QR.
  let { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: undefined,
  }));

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }) as never,
    browser: [process.env.BRAND_NAME || "Agent", "Chrome", "1.0.0"],
    version,
  });

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    void persistSessionFiles(id, sessionPath);
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    // Re-busca no mapa para garantir referência atualizada
    const c = _connections.get(id);
    if (!c) return;

    if (qr) {
      c.qr = qr;
      c.status = "qr";
      void persistConnection(c);
      logger.info({ id }, "QR Code gerado — disponível via /admin/whatsapp/connections");
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      logger.warn({ id, shouldReconnect }, "Conexão WhatsApp encerrada");

      if (shouldReconnect) {
        c.status = "connecting";
        c.qr = null;
        c.phone = null;
        void persistConnection(c);
        logger.info({ id }, "Reconectando ao WhatsApp em 5s...");
        setTimeout(() => {
          if (_connections.has(id)) {
            startWhatsApp(id).catch((err) =>
              logger.error({ err, id }, "Erro ao reconectar WhatsApp")
            );
          }
        }, 5_000);
      } else {
        c.status = "disconnected";
        c.qr = null;
        c.phone = null;
        c.sock = null;
        void persistConnection(c);
        void clearSessionFiles(id, sessionPath);
      }
    } else if (connection === "open") {
      c.status = "connected";
      c.qr = null;
      c.phone = sock.user?.id?.split(":")[0] ?? null;
      void persistConnection(c);
      logger.info({ id, phone: c.phone }, "WhatsApp conectado com sucesso");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      if (!from) continue;

      // Ignorar mensagens de grupos
      if (from.endsWith("@g.us")) continue;

      // Descarta duplicatas
      if (!markProcessed(msg.key.id ?? `${from}:${Date.now()}`)) continue;

      // Extração robusta de texto
      let text: string | null | undefined =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.buttonsResponseMessage?.selectedDisplayText ||
        msg.message?.listResponseMessage?.title ||
        msg.message?.templateButtonReplyMessage?.selectedDisplayText;

      // Áudio / nota de voz — transcreve via Whisper
      if (!text && isAudioMessage(msg)) {
        logger.info({ from }, "Áudio recebido — transcrevendo via Whisper");
        const transcription = await transcribeAudio(msg, sock);
        if (!transcription) {
          await sock.sendMessage(from, {
            text: "Recebi seu áudio, mas não consegui entendê-lo. Pode escrever sua mensagem? 😊",
          });
          continue;
        }
        text = transcription ?? undefined;
        logger.info({ from, text }, "Áudio transcrito");
      }

      if (!text) continue;

      logger.info({ from, text }, "Mensagem WhatsApp recebida");

      const contact = {
        name: msg.pushName ?? null,
        phone: from.replace(/@.*$/, ""),
      };

      try {
        const response = await handleWhatsAppMessage(from, text, contact);
        if (!response) continue;
        await sock.sendMessage(from, { text: response });
      } catch (err) {
        logger.error({ err, from }, "Erro ao processar mensagem WhatsApp");
      }
    }
  });

  conn.sock = sock;
  return sock;
}

// ─── Stop ─────────────────────────────────────────────────────────────────────

export async function stopWhatsApp(id: string): Promise<void> {
  const conn = _connections.get(id);
  if (!conn) throw new Error(`Conexão ${id} não encontrada`);

  if (conn.sock) {
    try {
      await conn.sock.logout();
    } catch {
      // Ignora erros ao fazer logout (socket pode já estar fechado)
    }
    conn.sock = null;
  }

  conn.status = "disconnected";
  conn.qr = null;
  conn.phone = null;
  void persistConnection(conn);
  logger.info({ id }, "WhatsApp desconectado via admin");
}
