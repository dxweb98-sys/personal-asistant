import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import {
  startTelegramBot,
  stopTelegramBot,
} from "./modules/telegram/telegram.bot.js";

const server = app.listen(env.PORT, () =>
  console.log(`Freedom Debt Agent API running at http://localhost:${env.PORT}`),
);
void startTelegramBot();

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await stopTelegramBot();
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
