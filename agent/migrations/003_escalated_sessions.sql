-- ============================================================
-- U-all IA — Migration 003: Escalated Sessions
-- Lock de sessões transferidas para atendimento humano (SDR/vendas).
-- ============================================================

CREATE TABLE IF NOT EXISTS escalated_sessions (
  session_id    TEXT PRIMARY KEY,
  escalated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_msg_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlocked_at   TIMESTAMPTZ,
  unlocked_by   TEXT  -- 'admin' | 'auto'
);

GRANT ALL ON escalated_sessions TO service_role;
