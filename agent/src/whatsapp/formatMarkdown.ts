/**
 * Converte saída padrão do LLM (Markdown) para WhatsApp Markdown.
 *
 * WhatsApp suporta:  *bold*, _italic_, ~strike~, > quote, - lista, 1. lista
 * WhatsApp NÃO suporta: ```code```, **bold**, # headers, [links](url)
 */
export function toWhatsAppMarkdown(text: string): string {
  return text
    // Blocos de código (``` ... ```) → conteúdo puro, sem os backticks
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "$1")
    // **bold** e __bold__ → *bold*
    .replace(/\*\*(.*?)\*\*/gs, "*$1*")
    .replace(/__(.*?)__/gs, "*$1*")
    // # Título de qualquer nível → *Título* (headers não existem no WhatsApp)
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    // [texto](url) → texto (links não são clicáveis no WhatsApp)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Múltiplas linhas em branco → no máximo duas
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
