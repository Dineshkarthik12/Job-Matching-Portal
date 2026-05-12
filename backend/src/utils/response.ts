import type { Response } from "express";

export function ok<T>(
  res: Response,
  data: T,
  message = "OK",
  status = 200,
  pagination?: Record<string, unknown>
) {
  return res.status(status).json({
    success: true,
    message,
    data,
    ...(pagination ? { pagination } : {}),
  });
}

export function fail(res: Response, message: string, status = 400, data: unknown = null) {
  return res.status(status).json({ success: false, message, data });
}
