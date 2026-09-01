import { buildApp } from "./app.js";

const app = buildApp();

// Render/Heroku/etc. injetam PORT; localmente usamos API_PORT (ou 3333).
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3333);
const host = process.env.API_HOST ?? "0.0.0.0";

app
  .listen({ port, host })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
