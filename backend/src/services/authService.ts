import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  accessTokenTtlSeconds,
} from "../utils/jwt.js";
import { hashToken, randomToken } from "../utils/tokens.js";
import { Role } from "@prisma/client";
import { config } from "../config/index.js";
import { blacklistToken } from "../lib/redis.js";
import { logger } from "../utils/logger.js";

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  companyName?: string;
  companyDescription?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) {
    throw new Error("Email already registered");
  }
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: input.role,
      },
    });
    if (input.role === Role.CANDIDATE) {
      await tx.candidateProfile.create({
        data: { userId: u.id, skills: [] },
      });
    }
    if (input.role === Role.RECRUITER) {
      await tx.recruiter.create({
        data: {
          userId: u.id,
          companyName: input.companyName ?? input.name,
          companyDescription: input.companyDescription,
        },
      });
    }
    return u;
  });
  return user;
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.status !== "ACTIVE") {
    throw new Error("Invalid credentials");
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error("Invalid credentials");
  return user;
}

export async function issueTokens(userId: string, role: Role) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.JWT_REFRESH_EXPIRES_DAYS);
  const row = await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(randomToken()), expiresAt },
  });
  const refreshJwt = signRefreshToken(userId, row.id);
  const tokenHash = hashToken(refreshJwt);
  await prisma.refreshToken.update({
    where: { id: row.id },
    data: { tokenHash },
  });
  const access = signAccessToken(userId, role);
  return { accessToken: access.token, accessJti: access.jti, refreshToken: refreshJwt, refreshRowId: row.id };
}

export async function rotateRefreshToken(oldRefreshJwt: string) {
  let payload;
  try {
    payload = verifyRefreshToken(oldRefreshJwt);
  } catch {
    throw new Error("Invalid refresh token");
  }
  const row = await prisma.refreshToken.findUnique({ where: { id: payload.tid } });
  const expectedHash = hashToken(oldRefreshJwt);
  if (
    !row ||
    row.userId !== payload.sub ||
    row.revokedAt ||
    row.expiresAt < new Date() ||
    row.tokenHash !== expectedHash
  ) {
    throw new Error("Invalid refresh token");
  }
  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user || user.status !== "ACTIVE") throw new Error("Invalid refresh token");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.JWT_REFRESH_EXPIRES_DAYS);

  let newRefreshJwt = "";
  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), replacedBy: "pending" },
    });
    const created = await tx.refreshToken.create({
      data: { userId: user.id, tokenHash: hashToken(randomToken()), expiresAt },
    });
    const refreshJwt = signRefreshToken(user.id, created.id);
    const tokenHash = hashToken(refreshJwt);
    await tx.refreshToken.update({
      where: { id: created.id },
      data: { tokenHash },
    });
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { replacedBy: created.id },
    });
    newRefreshJwt = refreshJwt;
  });

  const access = signAccessToken(user.id, user.role);
  return {
    accessToken: access.token,
    accessJti: access.jti,
    refreshToken: newRefreshJwt,
  };
}

export async function revokeRefreshByJwt(refreshJwt: string | undefined) {
  if (!refreshJwt) return;
  try {
    const payload = verifyRefreshToken(refreshJwt);
    const expectedHash = hashToken(refreshJwt);
    await prisma.refreshToken.updateMany({
      where: { id: payload.tid, userId: payload.sub, tokenHash: expectedHash },
      data: { revokedAt: new Date() },
    });
  } catch {
    /* ignore */
  }
}

export async function blacklistAccessJti(jti: string) {
  await blacklistToken(jti, accessTokenTtlSeconds());
}

export async function createPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return { sent: false };
  const raw = randomToken(32);
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });
  logger.info("Password reset token (dev)", { email: user.email, token: raw });
  return { sent: true, devToken: config.NODE_ENV !== "production" ? raw : undefined };
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const tokenHash = hashToken(token);
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!row) throw new Error("Invalid or expired token");
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function verifyEmailToken(raw: string) {
  const tokenHash = hashToken(raw);
  const row = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
  });
  if (!row) throw new Error("Invalid or expired token");
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerified: true } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } }),
  ]);
}

export async function enqueueEmailVerification(userId: string, email: string) {
  const raw = randomToken(24);
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt },
  });
  logger.info("Email verification (dev)", { email, token: raw });
  return raw;
}
