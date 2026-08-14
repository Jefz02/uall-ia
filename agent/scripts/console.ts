/**
 * Console de debug interativo — testa o agente diretamente no terminal.
 *
 * Uso:
 *   npm run console
 *
 * Não precisa de Docker nem de rebuild.
 * Usa as variáveis do .env local.
 */

import "dotenv/config";
import * as readline from "readline";
import { processMessage } from "../src/agents/graph";

const SESSION_ID = `console_${Date.now()}`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const RESET  = "\x1b[0m";
const DIM    = "\x1b[2m";

console.log(`\n${CYAN}╔══════════════════════════════════════════════╗${RESET}`);
console.log(`${CYAN}║   U-all IA — Console de Debug                ║${RESET}`);
console.log(`${CYAN}╚══════════════════════════════════════════════╝${RESET}`);
console.log(`${DIM}Session ID : ${SESSION_ID}${RESET}`);
console.log(`${DIM}Ctrl+C para sair\n${RESET}`);

function prompt(): void {
  rl.question(`${YELLOW}Você: ${RESET}`, async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      prompt();
      return;
    }

    if (trimmed.toLowerCase() === "/sessao") {
      console.log(`${DIM}Session ID: ${SESSION_ID}${RESET}\n`);
      prompt();
      return;
    }

    process.stdout.write(`${DIM}Agente: pensando...${RESET}`);

    try {
      const response = await processMessage(SESSION_ID, trimmed);
      // Limpa a linha de "pensando..."
      process.stdout.write("\r\x1b[K");
      console.log(`${GREEN}Agente: ${RESET}${response}\n`);
    } catch (err) {
      process.stdout.write("\r\x1b[K");
      console.error(`\x1b[31m[ERRO]\x1b[0m`, err, "\n");
    }

    prompt();
  });
}

rl.on("close", () => {
  console.log(`\n${DIM}Encerrando console...${RESET}`);
  process.exit(0);
});

prompt();
