import type { ChatMessage as ChatMessageType } from "@/hooks/useChat";
import { cn } from "@/lib/utils";

interface Props {
  message: ChatMessageType;
}

const ChatMessage = ({ message }: Props) => {
  const isBot = message.role === "assistant";

  const formatContent = (text: string) => {
    return text.split("\n").map((line, i) => {
      const parts = line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
      return (
        <span key={i}>
          {i > 0 && <br />}
          <span dangerouslySetInnerHTML={{ __html: parts }} />
        </span>
      );
    });
  };

  return (
    <div className={cn("flex gap-2", isBot ? "justify-start" : "justify-end")}>
      <div
        className="max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed"
        style={
          isBot
            ? {
                background: "hsl(var(--card))",
                color: "hsl(var(--card-foreground))",
                border: "1px solid hsl(var(--border))",
              }
            : {
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
              }
        }
      >
        {formatContent(message.content)}
      </div>
    </div>
  );
};

export default ChatMessage;
