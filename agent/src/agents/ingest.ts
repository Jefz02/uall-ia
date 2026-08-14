/**
 * Lógica central de ingestão RAG.
 * Pode ser chamada por:
 *  - scripts/ingest.ts  (CLI local / npm run ingest)
 *  - src/index.ts       (startup automático no Docker)
 *  - src/server.ts      (rota POST /sync)
 */

import { readFileSync } from "fs";
import { join } from "path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { buildEmbeddings } from "./rag";
import { config } from "../config";
import pino from "pino";

const logger = pino({ name: "ingest" });

// __dirname aponta para src/agents/ (ts-node) ou dist/agents/ (compilado)
// Em ambos os casos os .md são copiados para o mesmo caminho relativo
const DOCS = [
  {
    path: join(__dirname, "memory/conhecimento.md"),
    metadata: { source: "conhecimento", category: "comercial" },
  },
  {
    path: join(__dirname, "systemPrompts/systemPrompt.md"),
    metadata: { source: "system_prompt", category: "operacoes" },
  },
];

export async function runIngest(): Promise<{ chunks: number; sources: string[] }> {
  logger.info("Iniciando ingestão RAG...");

  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1800,
    chunkOverlap: 150,
    separators: ["\n\n---\n\n", "\n## ", "\n### ", "\n\n", "\n", " "],
  });

  const embeddings = buildEmbeddings();
  const allDocs: { pageContent: string; metadata: Record<string, unknown> }[] = [];
  const sources: string[] = [];

  for (const doc of DOCS) {
    const content = readFileSync(doc.path, "utf-8");
    const chunks = await splitter.createDocuments([content], [doc.metadata]);
    logger.info({ source: doc.metadata.source, chunks: chunks.length }, "Documento processado");
    allDocs.push(...chunks.map((c) => ({ pageContent: c.pageContent, metadata: c.metadata })));
    sources.push(String(doc.metadata.source));
  }

  // Apaga documentos anteriores para evitar duplicatas
  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError) {
    logger.warn({ err: deleteError.message }, "Aviso ao deletar documentos anteriores");
  }

  await SupabaseVectorStore.fromDocuments(allDocs, embeddings, {
    client: supabase,
    tableName: "documents",
    queryName: "match_documents",
  });

  logger.info({ total: allDocs.length }, "Ingestão concluída");
  return { chunks: allDocs.length, sources };
}
