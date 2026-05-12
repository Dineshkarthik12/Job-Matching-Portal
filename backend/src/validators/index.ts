import { z } from "zod";
import { Role } from "@prisma/client";

export const registerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(Role).refine((r) => r === Role.CANDIDATE || r === Role.RECRUITER, {
    message: "Only candidate or recruiter registration",
  }),
  companyName: z.string().min(1).max(200).optional(),
  companyDescription: z.string().max(5000).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const createJobSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(50000),
  skills: z.array(z.string()).default([]),
  experienceMin: z.number().int().min(0).optional(),
  experienceMax: z.number().int().min(0).optional(),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  salaryCurrency: z.string().length(3).optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"]).optional(),
  workMode: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
  location: z.string().max(500).optional(),
  companyName: z.string().max(300).optional(),
});

export const updateJobSchema = createJobSchema.partial();

export const updateCandidateProfileSchema = z.object({
  skills: z.array(z.string()).optional(),
  experience: z.record(z.string(), z.unknown()).optional(),
  education: z.record(z.string(), z.unknown()).optional(),
  certifications: z.array(z.string()).optional(),
  preferredRole: z.string().max(300).optional(),
  location: z.string().max(500).optional(),
  github: z.string().url().optional().or(z.literal("")),
  linkedin: z.string().url().optional().or(z.literal("")),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const jobSearchSchema = paginationSchema.extend({
  q: z.string().optional(),
  skills: z.string().optional(),
  location: z.string().optional(),
  workMode: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
});
