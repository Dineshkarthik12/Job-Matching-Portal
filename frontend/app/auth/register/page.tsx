"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type ApiResponse } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function ensureCsrf() {
  await api.get("/auth/csrf");
}

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"CANDIDATE" | "RECRUITER">("CANDIDATE");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void ensureCsrf();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await ensureCsrf();
      const payload =
        role === "RECRUITER"
          ? { name, email, password, role, companyName: companyName || name }
          : { name, email, password, role };
      const { data } = await api.post<
        ApiResponse<{ user: { id: string; name: string; email: string; role: string }; accessToken: string }>
      >("/auth/register", payload);
      if (!data.success) {
        setError(data.message);
        return;
      }
      setAccessToken(data.data.accessToken);
      setUser(data.data.user as never);
      const r = data.data.user.role;
      if (r === "RECRUITER") router.push("/dashboard/recruiter");
      else router.push("/dashboard/candidate");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : "Registration failed";
      setError(msg ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Password</label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Role</label>
              <select
                className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as "CANDIDATE" | "RECRUITER")}
              >
                <option value="CANDIDATE">Candidate</option>
                <option value="RECRUITER">Recruiter</option>
              </select>
            </div>
            {role === "RECRUITER" && (
              <div className="space-y-2">
                <label className="text-sm text-slate-300">Company name</label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              </div>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </Button>
            <p className="text-center text-sm text-slate-400">
              Already have an account?{" "}
              <Link className="text-sky-400 hover:underline" href="/auth/login">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
