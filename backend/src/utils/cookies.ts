import type { Response } from "express";
import { config } from "../config/index.js";

const REFRESH_COOKIE = "refresh_token";
const CSRF_COOKIE = "csrf_token";

export function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: config.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    path: "/api/v1/auth",
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
  });
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: config.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function getRefreshCookieName() {
  return REFRESH_COOKIE;
}

export const csrfCookieName = CSRF_COOKIE;
