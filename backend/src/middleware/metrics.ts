import type { Request, Response, NextFunction } from "express";
import { httpRequestDuration } from "../lib/metrics.js";

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const route = (req as Request & { route?: { path?: string } }).route?.path ?? req.path;
    httpRequestDuration.observe(
      { method: req.method, route, status: String(res.statusCode) },
      duration
    );
  });
  next();
}
