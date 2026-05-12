import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config/index.js";

const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUE_NAMES = {
  RESUME_PARSE: "resume-parse",
  SEARCH_INDEX: "search-index",
  EMAIL: "email",
  NOTIFICATIONS: "notifications",
  RECOMMENDATIONS: "recommendations",
} as const;

export const resumeParseQueue = new Queue(QUEUE_NAMES.RESUME_PARSE, { connection });
export const searchIndexQueue = new Queue(QUEUE_NAMES.SEARCH_INDEX, { connection });
export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, { connection });
export const notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, { connection });
export const recommendationsQueue = new Queue(QUEUE_NAMES.RECOMMENDATIONS, { connection });

export const defaultJobOpts: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export { connection as queueConnection };

export function createWorker(
  name: string,
  processor: (data: Record<string, unknown>) => Promise<void>
) {
  return new Worker(
    name,
    async (job) => {
      await processor(job.data as Record<string, unknown>);
    },
    { connection }
  );
}
