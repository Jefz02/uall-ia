const FONT_SANS  = import.meta.env.VITE_FONT_SANS  as string | undefined;
const FONT_SERIF = import.meta.env.VITE_FONT_SERIF as string | undefined;
const FONT_MONO  = import.meta.env.VITE_FONT_MONO  as string | undefined;

function toGoogleFontsParam(family: string): string {
  return family.trim().replace(/ /g, "+") + ":wght@400;700";
}

export function loadFonts(): void {
  const families = [FONT_SANS, FONT_SERIF, FONT_MONO].filter(Boolean) as string[];
  if (families.length === 0) return;

  const preconnect1 = document.createElement("link");
  preconnect1.rel = "preconnect";
  preconnect1.href = "https://fonts.googleapis.com";
  document.head.appendChild(preconnect1);

  const preconnect2 = document.createElement("link");
  preconnect2.rel = "preconnect";
  preconnect2.href = "https://fonts.gstatic.com";
  preconnect2.crossOrigin = "anonymous";
  document.head.appendChild(preconnect2);

  const params = families.map((f) => `family=${toGoogleFontsParam(f)}`).join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${params}&display=swap`;
  document.head.appendChild(link);

  const root = document.documentElement;
  if (FONT_SANS)  root.style.setProperty("--font-sans",  `${FONT_SANS}, system-ui, sans-serif`);
  if (FONT_SERIF) root.style.setProperty("--font-serif", `${FONT_SERIF}, serif`);
  if (FONT_MONO)  root.style.setProperty("--font-mono",  `${FONT_MONO}, monospace`);
}
