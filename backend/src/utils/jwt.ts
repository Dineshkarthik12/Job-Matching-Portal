import jwt, { type SignOptions } from "jsonwebtoken";
import { nanoid } from "nanoid";
import { config } from "../config/index.js";
import type { Role } from "@prisma/client";

export type AccessPayload = {
  sub: string;
  role: Role;
  jti: string;
  type: "access";
};

export type RefreshPayload = {
  sub: string;
  tid: string;
  type: "refresh";
};

export function signAccessToken(userId: string, role: Role) {
  const jti = nanoid();
  const payload: AccessPayload = { sub: userId, role, jti, type: "access" };
  const opts = { expiresIn: config.JWT_ACCESS_EXPIRES } as SignOptions;
  return {
    token: jwt.sign(payload, config.JWT_ACCESS_SECRET, opts),
    jti,
    expiresIn: config.JWT_ACCESS_EXPIRES,
  };
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessPayload;
  if (decoded.type !== "access") throw new Error("Invalid token type");
  return decoded;
}

export function signRefreshToken(userId: string, tokenId: string) {
  const payload: RefreshPayload = { sub: userId, tid: tokenId, type: "refresh" };
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: `${config.JWT_REFRESH_EXPIRES_DAYS}d`,
  } as SignOptions);
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshPayload;
  if (decoded.type !== "refresh") throw new Error("Invalid token type");
  return decoded;
}

export function accessTokenTtlSeconds(): number {
  return 15 * 60;
}
