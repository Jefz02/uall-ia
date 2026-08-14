-- ============================================================
-- U-all IA — Migration 004: Leads Qualificados
-- Registrado pela tool `registrar_lead` quando o agente conclui
-- o fluxo de qualificação (perfil + segmento + dor + contato + orçamento).
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  id                      BIGSERIAL   PRIMARY KEY,
  session_id              TEXT        NOT NULL,

  -- Perfil do site: provedor_isp | estabelecimento | integrador_parceiro
  perfil                  TEXT        NOT NULL,

  -- Dados de contato
  nome                    TEXT        NOT NULL,
  empresa                 TEXT,
  email                   TEXT,
  telefone                TEXT,

  -- Segmento de atuação (hotelaria, varejo, restaurante, saúde, educação, telecom...)
  segmento                TEXT,

  -- Dor principal (captar leads, cumprir LGPD, reduzir chamados, aumentar vendas, monetizar Wi-Fi...)
  dor_principal           TEXT,

  -- Infraestrutura
  possui_infraestrutura   BOOLEAN,
  qtd_pontos              INTEGER,
  volume_mensal_estimado  TEXT,
  ferramentas_atuais      TEXT,       -- CRM/ERP/ISP já usados (RD Station, IXC, TOTVS etc.)

  -- Comercial (BANT)
  plano_interesse         TEXT,       -- connect | marketing | experience
  ciclo_pagamento         TEXT,       -- mensal | anual
  prazo_implementacao     TEXT,
  decisor                 BOOLEAN,

  status                  TEXT        NOT NULL DEFAULT 'qualificado',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_session_idx ON leads (session_id);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads (created_at DESC);

GRANT ALL ON leads TO service_role;
GRANT USAGE, SELECT ON SEQUENCE leads_id_seq TO service_role;
