import { Router } from "express";
import { Role, Prisma } from "@prisma/client";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { ok, fail } from "../utils/response.js";
import { paginationSchema, updateCandidateProfileSchema, jobSearchSchema } from "../validators/index.js";
import { prisma } from "../lib/prisma.js";
import { getResumeUploadPresignedUrl } from "../services/s3Service.js";
import { nanoid } from "nanoid";
import * as resumeSvc from "../services/resumeService.js";
import * as recSvc from "../services/recommendationService.js";
import * as appSvc from "../services/applicationService.js";
import { searchJobs, suggestAutocomplete } from "../services/searchService.js";

export const candidateRouter = Router();

candidateRouter.use(authenticate, requireRole(Role.CANDIDATE));

candidateRouter.get("/profile", async (req: AuthedRequest, res, next) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.id },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    return ok(res, profile);
  } catch (e) {
    next(e);
  }
});

candidateRouter.patch("/profile", async (req: AuthedRequest, res, next) => {
  try {
    const body = updateCandidateProfileSchema.parse(req.body);
    const profile = await prisma.candidateProfile.update({
      where: { userId: req.user!.id },
      data: {
        skills: body.skills,
        experience: body.experience as Prisma.InputJsonValue | undefined,
        education: body.education as Prisma.InputJsonValue | undefined,
        certifications: body.certifications,
        preferredRole: body.preferredRole,
        location: body.location,
        github: body.github || undefined,
        linkedin: body.linkedin || undefined,
      },
    });
    return ok(res, profile, "Updated");
  } catch (e) {
    next(e);
  }
});

candidateRouter.post("/resume/presign", async (req: AuthedRequest, res, next) => {
  try {
    const { contentType } = req.body as { contentType?: string };
    if (contentType !== "application/pdf") {
      return fail(res, "Only application/pdf allowed", 400);
    }
    const key = `resumes/${req.user!.id}/${nanoid()}.pdf`;
    const maxSizeBytes = 5 * 1024 * 1024;
    const presign = await getResumeUploadPresignedUrl({ key, contentType, maxSizeBytes });
    return ok(res, { ...presign, maxSizeBytes }, "Presigned URL issued");
  } catch (e) {
    next(e);
  }
});

candidateRouter.post("/resume/complete", async (req: AuthedRequest, res, next) => {
  try {
    const { key, virusScanOk } = req.body as { key?: string; virusScanOk?: boolean };
    if (!key?.startsWith(`resumes/${req.user!.id}/`)) return fail(res, "Invalid key", 400);
    if (virusScanOk === false) return fail(res, "Upload rejected", 400);
    const resumeUrl = key;
    await resumeSvc.enqueueResumeParse(req.user!.id, resumeUrl);
    return ok(res, { resumeUrl }, "Resume queued for parsing");
  } catch (e) {
    next(e);
  }
});

candidateRouter.get("/recommendations", async (req: AuthedRequest, res, next) => {
  try {
    const matches = await recSvc.getJobRecommendationsForCandidate(req.user!.id, 12);
    const ids = matches.map((m) => m.jobId);
    const jobs = await prisma.job.findMany({ where: { id: { in: ids } } });
    const map = new Map(jobs.map((j) => [j.id, j]));
    const ordered = matches.map((m) => ({ score: m.score, job: map.get(m.jobId) })).filter((x) => x.job);
    return ok(res, ordered);
  } catch (e) {
    next(e);
  }
});

candidateRouter.post("/jobs/:jobId/apply", async (req: AuthedRequest, res, next) => {
  try {
    const app = await appSvc.applyToJob(req.user!.id, String(req.params.jobId));
    return ok(res, app, "Applied", 201);
  } catch (e) {
    if (e instanceof Error) return fail(res, e.message, 400);
    next(e);
  }
});

candidateRouter.get("/applications", async (req: AuthedRequest, res, next) => {
  try {
    const q = paginationSchema.parse(req.query);
    const result = await appSvc.listApplicationsForCandidate(req.user!.id, q.page, q.limit);
    return ok(res, result.items, "OK", 200, {
      page: q.page,
      limit: q.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / q.limit),
    });
  } catch (e) {
    next(e);
  }
});

candidateRouter.post("/jobs/:jobId/bookmark", async (req: AuthedRequest, res, next) => {
  try {
    await prisma.bookmark.upsert({
      where: { userId_jobId: { userId: req.user!.id, jobId: String(req.params.jobId) } },
      create: { userId: req.user!.id, jobId: String(req.params.jobId) },
      update: {},
    });
    return ok(res, null, "Bookmarked");
  } catch (e) {
    next(e);
  }
});

candidateRouter.delete("/jobs/:jobId/bookmark", async (req: AuthedRequest, res, next) => {
  try {
    await prisma.bookmark.deleteMany({
      where: { userId: req.user!.id, jobId: String(req.params.jobId) },
    });
    return ok(res, null, "Removed");
  } catch (e) {
    next(e);
  }
});

candidateRouter.get("/bookmarks", async (req: AuthedRequest, res, next) => {
  try {
    const q = paginationSchema.parse(req.query);
    const skip = (q.page - 1) * q.limit;
    const [items, total] = await Promise.all([
      prisma.bookmark.findMany({
        where: { userId: req.user!.id },
        include: { job: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: q.limit,
      }),
      prisma.bookmark.count({ where: { userId: req.user!.id } }),
    ]);
    return ok(res, items, "OK", 200, {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    });
  } catch (e) {
    next(e);
  }
});

candidateRouter.get("/notifications", async (req: AuthedRequest, res, next) => {
  try {
    const items = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(res, items);
  } catch (e) {
    next(e);
  }
});

candidateRouter.post("/notifications/:id/read", async (req: AuthedRequest, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { id: String(req.params.id), userId: req.user!.id },
      data: { read: true },
    });
    return ok(res, null, "Updated");
  } catch (e) {
    next(e);
  }
});

export const publicSearchRouter = Router();

publicSearchRouter.get("/jobs", async (req, res, next) => {
  try {
    const q = jobSearchSchema.parse(req.query);
    const from = (q.page - 1) * q.limit;
    const skills = q.skills ? q.skills.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const { hits, total } = await searchJobs({
      q: q.q,
      skills,
      location: q.location,
      workMode: q.workMode,
      from,
      size: q.limit,
    });
    return ok(res, hits, "OK", 200, {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    });
  } catch (e) {
    next(e);
  }
});

publicSearchRouter.get("/suggest", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "");
    if (q.length < 2) return ok(res, []);
    const items = await suggestAutocomplete(q);
    return ok(res, items);
  } catch (e) {
    next(e);
  }
});
