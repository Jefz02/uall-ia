import { useState } from "react";

const BRAND_NAME    = import.meta.env.VITE_BRAND_NAME    as string ?? "";
const BRAND_TAGLINE = import.meta.env.VITE_BRAND_TAGLINE as string ?? "";

function BrandLogo() {
  const extensions = ["svg", "png", "webp"];
  const [idx, setIdx] = useState(0);

  if (idx >= extensions.length) return null;

  return (
    <img
      src={`/assets/logo.${extensions[idx]}`}
      alt={BRAND_NAME}
      className="h-10 w-10 shrink-0 rounded-full object-contain"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

const ChatHeader = () => {
  return (
    <header
      className="relative flex items-center gap-3 px-4 py-3 z-20 shrink-0"
      style={{
        background: "hsl(var(--card))",
        borderBottom: "1px solid hsl(var(--border))",
      }}
    >
      <BrandLogo />

      <div className="flex flex-col flex-1 min-w-0">
        {BRAND_NAME && (
          <h1 className="font-serif text-sm font-bold uppercase tracking-widest leading-tight text-primary truncate">
            {BRAND_NAME}
          </h1>
        )}
        {BRAND_TAGLINE && (
          <p className="text-xs italic truncate leading-snug text-muted-foreground">
            {BRAND_TAGLINE}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="h-2 w-2 rounded-full"
          style={{
            background: "#22c55e",
            boxShadow: "0 0 6px rgba(34,197,94,0.8)",
          }}
        />
        <span className="text-xs text-muted-foreground font-sans">online</span>
      </div>
    </header>
  );
};

export default ChatHeader;
