import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { ok, fail } from "../utils/response.js";
import { createJobSchema, updateJobSchema, paginationSchema } from "../validators/index.js";
import * as jobService from "../services/jobService.js";
import * as appService from "../services/applicationService.js";
import { rankCandidates } from "../services/aiClient.js";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const jobRouter = Router();

jobRouter.post("/", authenticate, requireRole(Role.RECRUITER), async (req: AuthedRequest, res, next) => {
  try {
    const body = createJobSchema.parse(req.body);
    const job = await jobService.createJob(req.user!.id, body);
    return ok(res, job, "Job created", 201);
  } catch (e) {
    next(e);
  }
});

jobRouter.get("/mine", authenticate, requireRole(Role.RECRUITER), async (req: AuthedRequest, res, next) => {
  try {
    const q = paginationSchema.parse(req.query);
    const result = await jobService.listJobsForRecruiter(req.user!.id, q.page, q.limit);
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

jobRouter.patch("/:id", authenticate, requireRole(Role.RECRUITER), async (req: AuthedRequest, res, next) => {
  try {
    const body = updateJobSchema.parse(req.body);
    const job = await jobService.updateJob(String(req.params.id), req.user!.id, body);
    if (!job) return fail(res, "Not found", 404);
    return ok(res, job, "Updated");
  } catch (e) {
    next(e);
  }
});

jobRouter.delete("/:id", authenticate, requireRole(Role.RECRUITER), async (req: AuthedRequest, res, next) => {
  try {
    const okDel = await jobService.deleteJob(String(req.params.id), req.user!.id);
    if (!okDel) return fail(res, "Not found", 404);
    return ok(res, null, "Deleted");
  } catch (e) {
    next(e);
  }
});

jobRouter.get("/:id/applicants", authenticate, requireRole(Role.RECRUITER), async (req: AuthedRequest, res, next) => {
  try {
    const q = paginationSchema.parse(req.query);
    const result = await appService.listApplicationsForJob(String(req.params.id), req.user!.id, q.page, q.limit);
    if (!result) return fail(res, "Not found", 404);
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

jobRouter.post("/:id/match", authenticate, requireRole(Role.RECRUITER), async (req: AuthedRequest, res, next) => {
  try {
    const job = await jobService.getJobById(String(req.params.id));
    if (!job || job.recruiterId !== req.user!.id) return fail(res, "Not found", 404);
    const apps = await prisma.application.findMany({
      where: { jobId: job.id },
      include: { candidate: { include: { candidateProfile: true } } },
    });
    const jobEmbedding = (job.embedding as number[])?.length
      ? (job.embedding as number[])
      : new Array(384).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    const candidates = apps.map((a) => ({
      id: a.candidateId,
      resume_text: [
        a.candidate.candidateProfile?.skills.join(", "),
        JSON.stringify(a.candidate.candidateProfile?.experience ?? {}),
        a.candidate.name,
      ].join("\n"),
    }));
    let ranked: { candidate_id: string; score: number }[] = [];
    try {
      const out = await rankCandidates({
        job_embedding: jobEmbedding,
        candidates,
        top_k: 50,
      });
      ranked = out.ranked ?? [];
    } catch {
      ranked = candidates.map((c, i) => ({ candidate_id: c.id, score: 1 - i * 0.001 }));
    }
    return ok(res, { ranked });
  } catch (e) {
    next(e);
  }
});

jobRouter.patch(
  "/:jobId/applications/:applicationId",
  authenticate,
  requireRole(Role.RECRUITER),
  async (req: AuthedRequest, res, next) => {
    try {
      const { status, interviewAt } = req.body as { status?: string; interviewAt?: string };
      if (!status) return fail(res, "status required", 400);
      const updated = await appService.updateApplicationStatus(
        String(req.params.applicationId),
        req.user!.id,
        status as never,
        interviewAt ? new Date(interviewAt) : undefined
      );
      if (!updated) return fail(res, "Not found", 404);
      return ok(res, updated, "Updated");
    } catch (e) {
      next(e);
    }
  }
);

jobRouter.get("/:id", async (req, res, next) => {
  try {
    const job = await jobService.getJobById(String(req.params.id));
    if (!job) return fail(res, "Not found", 404);
    const auth = req.get("authorization");
    let viewerId: string | undefined;
    if (auth?.startsWith("Bearer ")) {
      try {
        const p = verifyAccessToken(auth.slice(7));
        viewerId = p.sub;
      } catch {
        viewerId = undefined;
      }
    }
    const isOwner = viewerId && job.recruiterId === viewerId;
    if ((!job.published || !job.moderated) && !isOwner) {
      return fail(res, "Not found", 404);
    }
    return ok(res, job);
  } catch (e) {
    next(e);
  }
});
