import { useState, useRef, type FormEvent } from "react";
import { Send } from "lucide-react";

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const ChatInput = ({ onSend, disabled }: Props) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative z-20 flex items-center gap-2 px-3 py-3 shrink-0"
      style={{
        background: "hsl(var(--card))",
        borderTop: "1px solid hsl(var(--border))",
      }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Digite sua mensagem..."
        disabled={disabled}
        className="flex-1 rounded-md px-3 py-2.5 text-sm focus:outline-none disabled:opacity-50 transition-all"
        style={{
          background: "hsl(var(--background))",
          color: "hsl(var(--foreground))",
          border: "1px solid hsl(var(--border))",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "hsl(var(--ring))";
          e.currentTarget.style.boxShadow = "0 0 0 2px hsl(var(--ring) / 0.15)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "hsl(var(--border))";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-all disabled:opacity-40 hover:scale-105 active:scale-95"
        style={{
          background: "hsl(var(--primary))",
        }}
      >
        <Send className="h-4 w-4 text-white" />
      </button>
    </form>
  );
};

export default ChatInput;
