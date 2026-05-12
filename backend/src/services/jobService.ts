import { prisma } from "../lib/prisma.js";
import { searchIndexQueue, defaultJobOpts } from "../queues/index.js";
import { indexJobDocument, deleteJobDocument } from "./elasticsearchService.js";
import type { EmploymentType, WorkMode } from "@prisma/client";

export async function createJob(
  recruiterId: string,
  input: {
    title: string;
    description: string;
    skills: string[];
    experienceMin?: number;
    experienceMax?: number;
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    employmentType?: EmploymentType;
    workMode?: WorkMode;
    location?: string;
    companyName?: string;
  }
) {
  const recruiter = await prisma.recruiter.findUnique({ where: { userId: recruiterId } });
  const companyName = input.companyName ?? recruiter?.companyName;
  const job = await prisma.job.create({
    data: {
      recruiterId,
      title: input.title,
      description: input.description,
      skills: input.skills,
      experienceMin: input.experienceMin,
      experienceMax: input.experienceMax,
      salaryMin: input.salaryMin,
      salaryMax: input.salaryMax,
      salaryCurrency: input.salaryCurrency ?? "USD",
      employmentType: input.employmentType ?? "FULL_TIME",
      workMode: input.workMode ?? "ONSITE",
      location: input.location,
      companyName,
      moderated: false,
      published: false,
    },
  });
  await searchIndexQueue.add(
    "index-job",
    { jobId: job.id },
    { ...defaultJobOpts, jobId: job.id }
  );
  return job;
}

export async function updateJob(
  jobId: string,
  recruiterId: string,
  patch: Partial<{
    title: string;
    description: string;
    skills: string[];
    experienceMin: number;
    experienceMax: number;
    salaryMin: number;
    salaryMax: number;
    salaryCurrency: string;
    employmentType: EmploymentType;
    workMode: WorkMode;
    location: string;
    companyName: string;
    published: boolean;
  }>
) {
  const job = await prisma.job.findFirst({ where: { id: jobId, recruiterId } });
  if (!job) return null;
  const updated = await prisma.job.update({ where: { id: jobId }, data: patch });
  await searchIndexQueue.add("index-job", { jobId }, { ...defaultJobOpts, jobId });
  return updated;
}

export async function deleteJob(jobId: string, recruiterId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, recruiterId } });
  if (!job) return false;
  await prisma.job.delete({ where: { id: jobId } });
  await searchIndexQueue.add("delete-job", { jobId }, defaultJobOpts);
  return true;
}

export async function getJobById(id: string) {
  return prisma.job.findUnique({
    where: { id },
    include: { recruiterUser: { select: { id: true, name: true, email: true } } },
  });
}

export async function listJobsForRecruiter(recruiterId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.job.findMany({
      where: { recruiterId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.job.count({ where: { recruiterId } }),
  ]);
  return { items, total, page, limit };
}

export async function syncJobToElasticsearch(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (!job.moderated || !job.published) {
    await deleteJobDocument(jobId);
    return;
  }
  await indexJobDocument({
    id: job.id,
    title: job.title,
    description: job.description,
    skills: job.skills,
    location: job.location,
    workMode: job.workMode,
    employmentType: job.employmentType,
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    companyName: job.companyName,
    published: job.published,
    moderated: job.moderated,
    createdAt: job.createdAt,
  });
}
