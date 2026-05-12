import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { csrfProtection } from "./middleware/csrf.js";
import { authRouter } from "./routes/authRoutes.js";
import { jobRouter } from "./routes/jobRoutes.js";
import { candidateRouter, publicSearchRouter } from "./routes/candidateRoutes.js";
import { adminRouter } from "./routes/adminRoutes.js";
import { registry } from "./lib/metrics.js";
import { verifyAccessToken } from "./utils/jwt.js";
import { isTokenBlacklisted } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
import { ensureJobsIndex } from "./services/elasticsearchService.js";

export async function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.FRONTEND_URL,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(metricsMiddleware);

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  app.get("/health", (_req, res) => {
    res.json({ success: true, message: "healthy", data: { uptime: process.uptime() } });
  });

  app.get("/metrics", async (_req, res) => {
    if (!config.METRICS_ENABLED) return res.status(404).end();
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

  const v1 = express.Router();

  v1.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    if (req.path.startsWith("/auth/csrf")) return next();
    if (req.method === "GET" && req.path.startsWith("/auth/verify-email")) return next();
    if (req.path.startsWith("/search")) return next();
    if (req.method === "GET" && /^\/jobs\/[^/]+$/.test(req.path)) return next();
    return csrfProtection(req, res, next);
  });

  v1.use("/auth", authRouter);
  v1.use("/search", publicSearchRouter);
  v1.use("/jobs", jobRouter);
  v1.use("/candidates", candidateRouter);
  v1.use("/admin", adminRouter);

  app.use("/api/v1", v1);
  app.use(errorHandler);

  await ensureJobsIndex();

  return app;
}

export async function createHttpServer() {
  const app = await createApp();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: config.FRONTEND_URL, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Unauthorized"));
      const payload = verifyAccessToken(token);
      if (await isTokenBlacklisted(payload.jti)) return next(new Error("Unauthorized"));
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, status: true },
      });
      if (!user || user.status !== "ACTIVE") return next(new Error("Unauthorized"));
      socket.data.userId = user.id;
      socket.data.role = user.role;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const room = `user:${socket.data.userId}`;
    socket.join(room);
    logger.info("Socket connected", { userId: socket.data.userId });
    socket.on("disconnect", () => {
      logger.info("Socket disconnected", { userId: socket.data.userId });
    });
  });

  return { app, server, io };
}

export function emitToUser(io: SocketIOServer, userId: string, event: string, payload: unknown) {
  io.to(`user:${userId}`).emit(event, payload);
}
