import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { isTokenBlacklisted } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import type { Role } from "@prisma/client";

export type AuthedRequest = Request & {
  user?: { id: string; role: Role; email: string; name: string };
};

export async function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const auth = req.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized", data: null });
  }
  try {
    const payload = verifyAccessToken(token);
    if (await isTokenBlacklisted(payload.jti)) {
      return res.status(401).json({ success: false, message: "Token revoked", data: null });
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, email: true, name: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({ success: false, message: "Unauthorized", data: null });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token", data: null });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized", data: null });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden", data: null });
    }
    next();
  };
}
