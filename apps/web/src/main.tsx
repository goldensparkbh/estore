import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { QueryProvider } from "./providers/query-provider";
import { applyDocumentTheme } from "./lib/theme";

applyDocumentTheme("light");

const el = document.getElementById("root");
if (!el) {
  throw new Error("Root element not found");
}

createRoot(el).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
);
