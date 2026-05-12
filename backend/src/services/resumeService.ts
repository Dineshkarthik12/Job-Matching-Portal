import { prisma } from "../lib/prisma.js";
import { parseResumePdf } from "./aiClient.js";
import { resumeParseQueue, defaultJobOpts } from "../queues/index.js";
import { getResumeDownloadUrl } from "./s3Service.js";
import { logger } from "../utils/logger.js";

export async function enqueueResumeParse(userId: string, resumeUrl: string) {
  await prisma.candidateProfile.update({
    where: { userId },
    data: { resumeUrl },
  });
  await resumeParseQueue.add(
    "parse",
    { userId, resumeUrl },
    { ...defaultJobOpts, jobId: `resume-${userId}` }
  );
}

export async function processResumeParseJob(userId: string, resumeKeyOrUrl: string) {
  let fetchUrl = resumeKeyOrUrl;
  if (!resumeKeyOrUrl.startsWith("http")) {
    const { url } = await getResumeDownloadUrl(resumeKeyOrUrl);
    if (!url) {
      logger.warn("S3 not configured; cannot fetch resume for AI parse", { resumeKeyOrUrl });
      throw new Error("Resume storage not configured for parsing");
    }
    fetchUrl = url;
  }
  const parsed = await parseResumePdf(fetchUrl);
  const skills = (parsed?.skills as string[]) ?? [];
  const experience = parsed?.experience ?? null;
  const education = parsed?.education ?? null;
  const embedding = parsed?.embedding ?? null;
  await prisma.candidateProfile.update({
    where: { userId },
    data: {
      skills,
      experience: experience as object,
      education: education as object,
      embedding: embedding ?? undefined,
      resumeParsedAt: new Date(),
    },
  });
}
