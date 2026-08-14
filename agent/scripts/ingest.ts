/**
 * CLI de ingestão RAG — executa via npm run ingest (ts-node local).
 *
 * Uso:
 *   npm run ingest
 *
 * Em produção (Docker), o ingest roda automaticamente no startup
 * e pode ser acionado via POST /sync.
 */

import "dotenv/config";
import { runIngest } from "../src/agents/ingest";

runIngest()
  .then(({ chunks, sources }) => {
    console.log(`\n✅ Ingestão concluída — ${chunks} chunks | fontes: ${sources.join(", ")}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Erro na ingestão:", err);
    process.exit(1);
  });
