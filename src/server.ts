import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import {
  startTelegramBot,
  stopTelegramBot,
} from "./modules/telegram/telegram.v2.bot.js";
import { migrateLegacyTelegramProfiles } from "./modules/telegram/telegram-profile-migration.service.js";

const server = app.listen(env.PORT, () =>
  console.log(
    `Personal Finance OS API running at http://localhost:${env.PORT}`,
  ),
);

async function startIntegrations() {
  const migration = await migrateLegacyTelegramProfiles();
  if (migration.migrated || migration.skipped) {
    console.log(
      `Legacy Telegram profiles: ${migration.migrated} migrated, ${migration.skipped} skipped`,
    );
  }
  await startTelegramBot();
}

startIntegrations().catch((error) => {
  console.error("Failed to start integrations", error);
});

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
