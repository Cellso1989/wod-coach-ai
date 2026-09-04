import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Instalação como PWA fica indisponível, mas o app continua funcionando normalmente.
    });
  });
}
