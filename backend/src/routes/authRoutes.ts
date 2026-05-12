import { Router } from "express";
import { randomToken } from "../utils/tokens.js";
import { ok, fail } from "../utils/response.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/index.js";
import {
  registerUser,
  loginUser,
  issueTokens,
  rotateRefreshToken,
  revokeRefreshByJwt,
  blacklistAccessJti,
  createPasswordReset,
  resetPasswordWithToken,
  verifyEmailToken,
  enqueueEmailVerification,
} from "../services/authService.js";
import { setRefreshCookie, clearRefreshCookie, setCsrfCookie, csrfCookieName } from "../utils/cookies.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { authFailures } from "../lib/metrics.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const authRouter = Router();

authRouter.get("/csrf", (_req, res) => {
  const token = randomToken(16);
  setCsrfCookie(res, token);
  return ok(res, { csrfToken: token, cookieName: csrfCookieName }, "CSRF token issued");
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    if (body.role === "RECRUITER" && !body.companyName) {
      return fail(res, "companyName required for recruiters", 400);
    }
    const user = await registerUser({
      name: body.name,
      email: body.email,
      password: body.password,
      role: body.role,
      companyName: body.companyName,
      companyDescription: body.companyDescription,
    });
    await enqueueEmailVerification(user.id, user.email);
    const tokens = await issueTokens(user.id, user.role);
    const csrf = randomToken(16);
    setCsrfCookie(res, csrf);
    setRefreshCookie(res, tokens.refreshToken);
    return ok(
      res,
      {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        accessToken: tokens.accessToken,
        expiresIn: 900,
        csrfToken: csrf,
      },
      "Registered",
      201
    );
  } catch (e) {
    if (e instanceof Error && e.message === "Email already registered") {
      authFailures.inc({ reason: "register_duplicate" });
      return fail(res, e.message, 409);
    }
    next(e);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await loginUser(body.email, body.password);
    const tokens = await issueTokens(user.id, user.role);
    const csrf = randomToken(16);
    setCsrfCookie(res, csrf);
    setRefreshCookie(res, tokens.refreshToken);
    return ok(res, {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken: tokens.accessToken,
      csrfToken: csrf,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Invalid credentials") {
      authFailures.inc({ reason: "login_invalid" });
      return fail(res, e.message, 401);
    }
    next(e);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const refresh = req.cookies?.refresh_token as string | undefined;
    if (!refresh) return fail(res, "Missing refresh token", 401);
    const tokens = await rotateRefreshToken(refresh);
    setRefreshCookie(res, tokens.refreshToken);
    return ok(res, { accessToken: tokens.accessToken });
  } catch {
    authFailures.inc({ reason: "refresh_invalid" });
    clearRefreshCookie(res);
    return fail(res, "Invalid refresh token", 401);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const refresh = req.cookies?.refresh_token as string | undefined;
    await revokeRefreshByJwt(refresh);
    const auth = req.get("authorization");
    const access = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (access) {
      try {
        const p = verifyAccessToken(access);
        await blacklistAccessJti(p.jti);
      } catch {
        /* ignore */
      }
    }
    clearRefreshCookie(res);
    return ok(res, null, "Logged out");
  } catch (e) {
    next(e);
  }
});

authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const result = await createPasswordReset(body.email);
    return ok(res, { sent: result.sent, devToken: result.devToken }, "If email exists, reset was queued");
  } catch (e) {
    next(e);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    await resetPasswordWithToken(body.token, body.password);
    return ok(res, null, "Password updated");
  } catch (e) {
    if (e instanceof Error) return fail(res, e.message, 400);
    return next(e);
  }
});

authRouter.get("/verify-email/:token", async (req, res, next) => {
  try {
    await verifyEmailToken(String(req.params.token));
    return ok(res, null, "Email verified");
  } catch (e) {
    if (e instanceof Error) return fail(res, e.message, 400);
    return next(e);
  }
});

authRouter.get("/me", authenticate, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { candidateProfile: true, recruiter: true },
    });
    return ok(res, user);
  } catch (e) {
    next(e);
  }
});
