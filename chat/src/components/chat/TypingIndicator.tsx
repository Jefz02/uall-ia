const TypingIndicator = () => {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex gap-1.5 rounded-lg px-4 py-3"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{
              background: "hsl(var(--primary))",
              animation: "bounce 1.4s infinite ease-in-out both",
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default TypingIndicator;
