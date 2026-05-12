import { Router } from "express";
import { Role, UserStatus } from "@prisma/client";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { ok, fail } from "../utils/response.js";
import { paginationSchema } from "../validators/index.js";
import { prisma } from "../lib/prisma.js";

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole(Role.ADMIN));

adminRouter.get("/users", async (req, res, next) => {
  try {
    const q = paginationSchema.parse(req.query);
    const skip = (q.page - 1) * q.limit;
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: q.limit,
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      }),
      prisma.user.count(),
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

adminRouter.patch("/users/:id/status", async (req: AuthedRequest, res, next) => {
  try {
    const { status } = req.body as { status?: UserStatus };
    if (!status || !["ACTIVE", "SUSPENDED", "BANNED"].includes(status)) {
      return fail(res, "Invalid status", 400);
    }
    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: { status },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "user.status",
        resource: "User",
        resourceId: user.id,
        metadata: { status },
        ip: req.ip,
      },
    });
    return ok(res, user, "Updated");
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/jobs/pending", async (_req, res, next) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { moderated: false },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(res, jobs);
  } catch (e) {
    next(e);
  }
});

adminRouter.post("/jobs/:id/moderate", async (req: AuthedRequest, res, next) => {
  try {
    const { approve } = req.body as { approve?: boolean };
    const job = await prisma.job.update({
      where: { id: String(req.params.id) },
      data: { moderated: approve !== false, published: approve !== false },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "job.moderate",
        resource: "Job",
        resourceId: job.id,
        metadata: { approve },
        ip: req.ip,
      },
    });
    return ok(res, job, "Moderated");
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/analytics/summary", async (_req, res, next) => {
  try {
    const [users, jobs, applications] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: true }),
      prisma.job.count(),
      prisma.application.count(),
    ]);
    return ok(res, { usersByRole: users, jobs, applications });
  } catch (e) {
    next(e);
  }
});
