interface Props {
  onSelect: (text: string) => void;
}

const SUGGESTIONS = [
  "Conhecer os planos",
  "Sou provedor/ISP",
  "Preciso captar leads",
  "Falar com especialista",
];

const ChatSuggestions = ({ onSelect }: Props) => {
  return (
    <div
      className="relative z-20 flex flex-wrap gap-2 px-4 py-2.5 shrink-0"
      style={{ borderTop: "1px solid hsl(var(--border))" }}
    >
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
          style={{
            color: "hsl(var(--muted-foreground))",
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--muted))",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "hsl(var(--accent))";
            e.currentTarget.style.color = "hsl(var(--accent-foreground))";
            e.currentTarget.style.borderColor = "hsl(var(--accent))";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "hsl(var(--muted))";
            e.currentTarget.style.color = "hsl(var(--muted-foreground))";
            e.currentTarget.style.borderColor = "hsl(var(--border))";
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
};

export default ChatSuggestions;
