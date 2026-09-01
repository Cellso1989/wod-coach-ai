import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // O .env vive na raiz do monorepo, não em apps/web — sem isto, Vite
  // nunca encontra VITE_API_URL e import.meta.env.VITE_API_URL fica
  // sempre undefined em dev (bug real encontrado e corrigido: fazia o
  // frontend chamar a própria porta 5173 em vez de localhost:3333).
  envDir: "../../",
  server: {
    port: 5173,
  },
});
