import { Worker } from "bullmq";
import { queueConnection, QUEUE_NAMES } from "../queues/index.js";
import { logger } from "../utils/logger.js";
import { processResumeParseJob } from "../services/resumeService.js";
import { prisma } from "../lib/prisma.js";

export function startWorkers() {
  new Worker(
    QUEUE_NAMES.RESUME_PARSE,
    async (job) => {
      const { userId, resumeUrl } = job.data as { userId: string; resumeUrl: string };
      await processResumeParseJob(userId, resumeUrl);
    },
    { connection: queueConnection }
  );

  // Search indexing is handled by Postgres generated tsvector column.
  // This worker is kept as a no-op to drain any old jobs still in the queue.
  new Worker(
    QUEUE_NAMES.SEARCH_INDEX,
    async (job) => {
      logger.info("Search index job (no-op, Postgres handles search)", { name: job.name });
    },
    { connection: queueConnection }
  );


  new Worker(
    QUEUE_NAMES.EMAIL,
    async (job) => {
      logger.info("Email job", { name: job.name, data: job.data });
    },
    { connection: queueConnection }
  );

  new Worker(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job) => {
      const data = job.data as {
        userId?: string;
        recruiterId?: string;
        title: string;
        body: string;
        metadata?: object;
      };
      if (data.userId) {
        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: data.title,
            body: data.body,
            metadata: data.metadata,
          },
        });
      }
      if (data.recruiterId) {
        await prisma.notification.create({
          data: {
            userId: data.recruiterId,
            title: data.title,
            body: data.body,
            metadata: data.metadata,
          },
        });
      }
    },
    { connection: queueConnection }
  );

  new Worker(
    QUEUE_NAMES.RECOMMENDATIONS,
    async (job) => {
      logger.info("Recommendation job", { data: job.data });
    },
    { connection: queueConnection }
  );

  logger.info("BullMQ workers started");
}
