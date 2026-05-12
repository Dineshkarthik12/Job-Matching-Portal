import { createHttpServer } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  const { server } = await createHttpServer();

  server.listen(config.PORT, () => {
    logger.info(`API listening on port ${config.PORT}`);
  });

  const shutdown = async () => {
    logger.info("Shutting down");
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  logger.error("Fatal", { e });
  process.exit(1);
});
