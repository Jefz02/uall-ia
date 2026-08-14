import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);
  }
  return _client;
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function saveMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  piiRedacted = false
): Promise<void> {
  const { error } = await getSupabaseClient().from("conversations").insert({
    session_id: sessionId,
    role,
    content,
    pii_redacted: piiRedacted,
  });
  if (error) throw new Error(`Supabase saveMessage: ${error.message}`);
}

export async function getConversationHistory(
  sessionId: string,
  limit = 10
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const { data, error } = await getSupabaseClient()
    .from("conversations")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Supabase getHistory: ${error.message}`);
  // inverter para ordem cronológica
  return ((data ?? []) as { role: "user" | "assistant"; content: string }[]).reverse();
}

// ─── Session Memory ───────────────────────────────────────────────────────────

export async function getSessionMemory(
  sessionId: string
): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabaseClient()
    .from("session_memory")
    .select("data")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) throw new Error(`Supabase getSessionMemory: ${error.message}`);
  return (data?.data as Record<string, unknown>) ?? {};
}

export async function upsertSessionMemory(
  sessionId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const current = await getSessionMemory(sessionId);
  const merged = { ...current, ...patch };

  const { error } = await getSupabaseClient()
    .from("session_memory")
    .upsert({ session_id: sessionId, data: merged, updated_at: new Date().toISOString() });

  if (error) throw new Error(`Supabase upsertSessionMemory: ${error.message}`);
}

export async function clearSessionMemoryKey(sessionId: string, key: string): Promise<void> {
  const current = await getSessionMemory(sessionId);
  const { [key]: _removed, ...rest } = current;

  const { error } = await getSupabaseClient()
    .from("session_memory")
    .upsert({ session_id: sessionId, data: rest, updated_at: new Date().toISOString() });

  if (error) throw new Error(`Supabase clearSessionMemoryKey: ${error.message}`);
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export interface LeadData {
  session_id: string;
  perfil: string;
  nome: string;
  empresa?: string;
  email?: string;
  telefone?: string;
  segmento?: string;
  dor_principal?: string;
  possui_infraestrutura?: boolean;
  qtd_pontos?: number;
  volume_mensal_estimado?: string;
  ferramentas_atuais?: string;
  plano_interesse?: string;
  ciclo_pagamento?: string;
  prazo_implementacao?: string;
  decisor?: boolean;
}

export async function saveLead(data: LeadData): Promise<void> {
  const { error } = await getSupabaseClient().from("leads").insert(data);
  if (error) throw new Error(`Supabase saveLead: ${error.message}`);
}
