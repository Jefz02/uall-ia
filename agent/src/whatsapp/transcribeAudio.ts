import { WAMessage, WASocket, downloadMediaMessage } from "whaileys";
import OpenAI, { toFile } from "openai";
import { createReadStream, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import pino from "pino";
import { config } from "../config";

const logger = pino({ name: "transcribe" });

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  return _openai;
}

/**
 * Retorna true se a mensagem contém áudio (voz ou arquivo de áudio).
 */
export function isAudioMessage(msg: WAMessage): boolean {
  return !!(msg.message?.audioMessage || msg.message?.ptvMessage);
}

/**
 * Baixa o áudio do WhatsApp e transcreve via Whisper.
 * Retorna o texto transcrito ou null em caso de falha.
 */
export async function transcribeAudio(
  msg: WAMessage,
  sock: WASocket
): Promise<string | null> {
  const tmpPath = join(tmpdir(), `wa_audio_${Date.now()}.ogg`);
  try {
    const buffer = (await downloadMediaMessage(
      msg,
      "buffer",
      {},
      {
        logger: pino({ level: "silent" }) as never,
        reuploadRequest: sock.updateMediaMessage,
      }
    )) as Buffer;

    writeFileSync(tmpPath, buffer);

    const file = await toFile(createReadStream(tmpPath), "audio.ogg", {
      type: "audio/ogg",
    });

    const result = await getOpenAI().audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "pt",
    });

    const text = result.text?.trim();
    if (!text) return null;

    logger.info({ chars: text.length }, "[Whisper] Áudio transcrito com sucesso");
    return text;
  } catch (err) {
    logger.error({ err }, "[Whisper] Falha ao transcrever áudio");
    return null;
  } finally {
    try { unlinkSync(tmpPath); } catch { /* não fatal */ }
  }
}
