import { Registry, collectDefaultMetrics, Histogram, Counter } from "prom-client";
import { config } from "../config/index.js";

export const registry = new Registry();

if (config.METRICS_ENABLED) {
  collectDefaultMetrics({ register: registry });
}

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const authFailures = new Counter({
  name: "auth_failures_total",
  help: "Authentication failures",
  labelNames: ["reason"],
  registers: [registry],
});
