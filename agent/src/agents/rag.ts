import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import { getSupabaseClient } from "../monitoring/supabase";

let _vectorStore: SupabaseVectorStore | null = null;

/**
 * Embeddings locais com all-MiniLM-L6-v2 via @xenova/transformers.
 * Sem necessidade de API key. Modelo baixado automaticamente na primeira execução.
 */
function buildEmbeddings(): HuggingFaceTransformersEmbeddings {
  return new HuggingFaceTransformersEmbeddings({
    modelName: "Xenova/all-MiniLM-L6-v2",
  });
}

/**
 * Retorna o vector store Supabase (singleton).
 * Requer que a tabela `documents` com extensão pgvector já exista no Supabase.
 */
export async function getVectorStore(): Promise<SupabaseVectorStore> {
  if (!_vectorStore) {
    _vectorStore = new SupabaseVectorStore(buildEmbeddings(), {
      client: getSupabaseClient(),
      tableName: "documents",
      queryName: "match_documents",
    });
  }
  return _vectorStore;
}

/**
 * Busca os K chunks mais relevantes para a query do usuário.
 */
export async function retrieveContext(
  query: string,
  k = 4
): Promise<string> {
  const store = await getVectorStore();
  const docs = await store.similaritySearch(query, k);
  if (docs.length === 0) {
    return "Nenhuma informação encontrada na base de conhecimento para esta consulta.";
  }
  return docs.map((d) => d.pageContent).join("\n\n---\n\n");
}

export { buildEmbeddings };
