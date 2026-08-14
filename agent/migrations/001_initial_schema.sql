-- ============================================================
-- U-all IA — Migration 001: Initial Schema
-- Executado automaticamente ao inicializar o container PostgreSQL
-- ============================================================

-- ─── Extensões ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Roles do PostgREST ───────────────────────────────────────────────────────
-- anon: role para requisições sem autenticação
-- service_role: role com acesso total (bypass de RLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, service_role;

-- ─── Histórico de conversas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT        NOT NULL,
  role         TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT        NOT NULL,
  pii_redacted BOOLEAN     DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_session
  ON conversations(session_id, created_at);

-- ─── Memória contextual por sessão ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_memory (
  session_id TEXT        PRIMARY KEY,
  data       JSONB       DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Alertas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL,
  session_id TEXT,
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_type_created
  ON alerts(type, created_at DESC);

-- ─── Documentos RAG (pgvector) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  content   TEXT         NOT NULL,
  metadata  JSONB        DEFAULT '{}',
  embedding VECTOR(384)               -- all-MiniLM-L6-v2 = 384 dimensões
);

CREATE INDEX IF NOT EXISTS idx_documents_embedding
  ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── Função de busca por similaridade (LangChain SupabaseVectorStore) ─────────
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding VECTOR(384),
  match_count     INT   DEFAULT 4,
  filter          JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id         UUID,
  content    TEXT,
  metadata   JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE documents.metadata @> filter
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Garante que novos objetos criados também herdem as permissões
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role;

-- anon tem acesso apenas de leitura a documentos públicos
GRANT SELECT ON documents TO anon;
