import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { loadFonts } from "./lib/fonts";

loadFonts();
createRoot(document.getElementById("root")!).render(<App />);
