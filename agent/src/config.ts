import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // LLM
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY é obrigatório"),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),

  // Supabase
  SUPABASE_URL: z.string().url("SUPABASE_URL deve ser uma URL válida"),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY é obrigatório"),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // LangSmith
  LANGCHAIN_TRACING_V2: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  LANGCHAIN_API_KEY: z.string().optional(),
  LANGCHAIN_PROJECT: z.string().default("uall-ia-agent"),

  // App
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  WHATSAPP_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX_MESSAGES: z.coerce.number().default(10),

  // Cache
  RESPONSE_CACHE_TTL_SECONDS: z.coerce.number().default(3600),

  // Webhooks de ferramentas
  LEAD_URL: z.string().url().default("http://localhost:4000/leads"),
  ESCALATION_URL: z.string().url().default("http://localhost:4000/escalations"),

  // Admin Panel
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD deve ter ao menos 8 caracteres"),
  ADMIN_JWT_SECRET: z.string().min(32, "ADMIN_JWT_SECRET deve ter ao menos 32 caracteres"),

  // Notificação WhatsApp para o time comercial
  WHATSAPP_NOTIFY_PHONE: z.string().default(""),

  // Chave (hex, 32 bytes) para criptografar sessão WhatsApp persistida no banco
  WA_SESSION_ENCRYPTION_KEY: z.string().default("0".repeat(64)),

  // Marca
  BRAND_NAME: z.string().default("U-all Solutions"),
  BRAND_TAGLINE: z.string().default("Wi-Fi Marketing e captação de dados com IA"),
  CONTACT_EMAIL: z.string().default("contato@uallsolutions.com.br"),
  CONTACT_WHATSAPP: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
