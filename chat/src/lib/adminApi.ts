const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? "http://localhost:3000";

export type WhatsAppStatus = "disconnected" | "connecting" | "qr" | "connected";

export interface WAConnection {
  id: string;
  label: string;
  status: WhatsAppStatus;
  qr: string | null;
  phone: string | null;
}

export interface Contact {
  session_id: string;
  name: string | null;
  phone: string | null;
  is_locked: boolean;
  updated_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function getToken(): string | null {
  return sessionStorage.getItem("admin_token");
}

/** Headers com Content-Type JSON + Bearer */
function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Headers só com Bearer (sem Content-Type) — para POSTs sem body */
function bearerHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function adminLogin(password: string): Promise<{ token: string }> {
  const res = await fetch(`${AGENT_URL}/admin/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Erro ao autenticar");
  }
  return res.json();
}

// ─── WhatsApp — múltiplas conexões ────────────────────────────────────────

export async function fetchConnections(): Promise<WAConnection[]> {
  const res = await fetch(`${AGENT_URL}/admin/whatsapp/connections`, {
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("Erro ao buscar conexões");
  return res.json();
}

export async function createWAConnection(label: string): Promise<WAConnection> {
  const res = await fetch(`${AGENT_URL}/admin/whatsapp/connections`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ label }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Erro ao criar conexão");
  }
  return res.json();
}

export async function updateWAConnectionLabel(id: string, label: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/admin/whatsapp/connections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ label }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Erro ao renomear conexão");
  }
}

export async function deleteWAConnection(id: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/admin/whatsapp/connections/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: bearerHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Erro ao deletar conexão");
  }
}

export async function connectWAConnection(id: string): Promise<void> {
  const res = await fetch(
    `${AGENT_URL}/admin/whatsapp/connections/${encodeURIComponent(id)}/connect`,
    { method: "POST", headers: bearerHeaders() }
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Erro ao conectar");
  }
}

export async function disconnectWAConnection(id: string): Promise<void> {
  const res = await fetch(
    `${AGENT_URL}/admin/whatsapp/connections/${encodeURIComponent(id)}/disconnect`,
    { method: "POST", headers: bearerHeaders() }
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Erro ao desconectar");
  }
}

// ─── Contatos e chat ───────────────────────────────────────────────────────

export async function fetchContacts(): Promise<Contact[]> {
  const res = await fetch(`${AGENT_URL}/admin/contacts`, { headers: authHeaders() });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("Erro ao buscar contatos");
  return res.json();
}

export async function fetchMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await fetch(
    `${AGENT_URL}/admin/contacts/${encodeURIComponent(sessionId)}/messages`,
    { headers: authHeaders() }
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("Erro ao buscar mensagens");
  return res.json();
}

export async function sendAdminMessage(sessionId: string, text: string): Promise<void> {
  const res = await fetch(
    `${AGENT_URL}/admin/contacts/${encodeURIComponent(sessionId)}/send`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ text }),
    }
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Erro ao enviar");
  }
}

// ─── Lock / Unlock ─────────────────────────────────────────────────────────

export async function unlockConversation(sessionId: string): Promise<void> {
  const res = await fetch(
    `${AGENT_URL}/admin/conversations/${encodeURIComponent(sessionId)}/unlock`,
    // sem Content-Type pois não há body — evita FST_ERR_CTP_EMPTY_JSON_BODY
    { method: "POST", headers: bearerHeaders() }
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("Falha ao desbloquear");
}

export async function lockConversation(sessionId: string): Promise<void> {
  const res = await fetch(
    `${AGENT_URL}/admin/conversations/${encodeURIComponent(sessionId)}/lock`,
    { method: "POST", headers: bearerHeaders() }
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("Falha ao bloquear");
}

// ─── Leads ─────────────────────────────────────────────────────────────────

export interface Lead {
  id: number;
  session_id: string;
  perfil: string;
  nome: string;
  empresa: string | null;
  email: string | null;
  telefone: string | null;
  segmento: string | null;
  dor_principal: string | null;
  possui_infraestrutura: boolean | null;
  qtd_pontos: number | null;
  volume_mensal_estimado: string | null;
  ferramentas_atuais: string | null;
  plano_interesse: string | null;
  ciclo_pagamento: string | null;
  prazo_implementacao: string | null;
  decisor: boolean | null;
  status: string;
  created_at: string;
}

export async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch(`${AGENT_URL}/admin/leads`, { headers: authHeaders() });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("Erro ao buscar leads");
  return res.json();
}

export async function updateLeadStatus(id: number, status: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/admin/leads/${id}/status`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("Erro ao atualizar status do lead");
}
