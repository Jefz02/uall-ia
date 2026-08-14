-- ============================================================
-- U-all IA — Migration 002: WhatsApp Connections
-- Suporta múltiplas conexões (multi-atendente) com sessão
-- criptografada persistida no banco (sobrevive a redeploys).
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id           TEXT        PRIMARY KEY,
  label        TEXT        NOT NULL DEFAULT 'Conexão Principal',
  status       TEXT        NOT NULL DEFAULT 'disconnected'
               CHECK (status IN ('disconnected', 'connecting', 'qr', 'connected')),
  phone        TEXT,
  session_data TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON whatsapp_connections TO service_role;
