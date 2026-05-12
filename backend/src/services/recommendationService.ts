import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { matchJobs } from "./aiClient.js";
import { logger } from "../utils/logger.js";

const CACHE_PREFIX = "rec:";

export async function getJobRecommendationsForCandidate(userId: string, topK = 10) {
  const cacheKey = `${CACHE_PREFIX}${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as { jobId: string; score: number }[];
    } catch {
      /* fall through */
    }
  }
  const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
  const embedding = profile?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    const jobs = await prisma.job.findMany({
      where: { published: true, moderated: true },
      take: topK,
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return jobs.map((j, i) => ({ jobId: j.id, score: 1 - i * 0.01 }));
  }
  const jobs = await prisma.job.findMany({
    where: { published: true, moderated: true },
    take: 80,
    select: { id: true, title: true, description: true, skills: true },
  });
  const job_descriptions = jobs.map((j) => ({
    id: j.id,
    text: `${j.title}\n${j.description}\nSkills: ${j.skills.join(", ")}`,
  }));
  try {
    const result = await matchJobs({
      candidate_embedding: embedding as number[],
      job_descriptions,
      top_k: topK,
    });
    const matches = (result.matches ?? []).map((m: { job_id?: string; jobId?: string; score: number }) => ({
      jobId: m.job_id ?? m.jobId ?? "",
      score: m.score,
    })).filter((m) => m.jobId);
    await redis.set(cacheKey, JSON.stringify(matches), "EX", 300);
    return matches;
  } catch (e) {
    logger.warn("AI match-jobs unavailable, using skill overlap fallback", { e });
    const skills = new Set(profile?.skills ?? []);
    const ranked = jobs
      .map((j) => ({
        job_id: j.id,
        score: j.skills.filter((s) => skills.has(s)).length / Math.max(1, j.skills.length),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => ({ jobId: r.job_id, score: r.score }));
    return ranked;
  }
}
