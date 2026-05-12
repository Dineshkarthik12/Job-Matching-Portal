import "dotenv/config";
import { startWorkers } from "./workers/index.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./lib/prisma.js";

startWorkers();
logger.info("Worker process started");

const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
