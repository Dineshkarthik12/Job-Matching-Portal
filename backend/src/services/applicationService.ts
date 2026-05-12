import { prisma } from "../lib/prisma.js";
import { Role, ApplicationStatus } from "@prisma/client";
import { notificationsQueue, defaultJobOpts } from "../queues/index.js";

export async function applyToJob(candidateId: string, jobId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, published: true, moderated: true },
  });
  if (!job) throw new Error("Job not found");
  const user = await prisma.user.findUnique({ where: { id: candidateId } });
  if (!user || user.role !== Role.CANDIDATE) throw new Error("Only candidates can apply");
  const existing = await prisma.application.findUnique({
    where: { candidateId_jobId: { candidateId, jobId } },
  });
  if (existing) throw new Error("Already applied");
  const app = await prisma.application.create({
    data: { candidateId, jobId },
    include: { job: true },
  });
  await notificationsQueue.add(
    "application-created",
    {
      recruiterId: job.recruiterId,
      title: "New application",
      body: `A candidate applied to ${job.title}`,
      metadata: { jobId, applicationId: app.id },
    },
    defaultJobOpts
  );
  return app;
}

export async function listApplicationsForCandidate(candidateId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.application.findMany({
      where: { candidateId },
      include: { job: true },
      orderBy: { appliedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.application.count({ where: { candidateId } }),
  ]);
  return { items, total, page, limit };
}

export async function listApplicationsForJob(
  jobId: string,
  recruiterId: string,
  page: number,
  limit: number
) {
  const job = await prisma.job.findFirst({ where: { id: jobId, recruiterId } });
  if (!job) return null;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.application.findMany({
      where: { jobId },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
            candidateProfile: true,
          },
        },
      },
      orderBy: { appliedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.application.count({ where: { jobId } }),
  ]);
  return { items, total, page, limit };
}

export async function updateApplicationStatus(
  applicationId: string,
  recruiterId: string,
  status: ApplicationStatus,
  interviewAt?: Date
) {
  const app = await prisma.application.findFirst({
    where: { id: applicationId, job: { recruiterId } },
    include: { job: true, candidate: true },
  });
  if (!app) return null;
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { status, interviewAt: interviewAt ?? app.interviewAt },
  });
  await notificationsQueue.add(
    "application-status",
    {
      userId: app.candidateId,
      title: "Application update",
      body: `Your application for ${app.job.title} is now ${status}`,
      metadata: { applicationId, jobId: app.jobId },
    },
    defaultJobOpts
  );
  return updated;
}
