import type { Request, Response, NextFunction } from "express";
import { csrfCookieName } from "../utils/cookies.js";

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  const header = req.get("x-csrf-token");
  const cookie = req.cookies?.[csrfCookieName];
  if (!header || !cookie || header !== cookie) {
    return res.status(403).json({
      success: false,
      message: "CSRF validation failed",
      data: null,
    });
  }
  next();
}
