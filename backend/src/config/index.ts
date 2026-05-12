import dotenv from "dotenv";
dotenv.config();

const envSchema = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parseInt(process.env.PORT ?? "4000", 10),
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/jobmatching",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES ?? "15m",
  JWT_REFRESH_EXPIRES_DAYS: parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS ?? "7", 10),
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",
  AI_SERVICE_URL: process.env.AI_SERVICE_URL ?? "http://localhost:8000",
  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL ?? "http://localhost:9200",
  AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET ?? "",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "",
  METRICS_ENABLED: process.env.METRICS_ENABLED !== "false",
};

export const config = envSchema;
