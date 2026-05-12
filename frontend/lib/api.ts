import axios from "axios";

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const api = axios.create({
  baseURL: `${baseURL}/api/v1`,
  withCredentials: true,
});

function readCsrf() {
  if (typeof document === "undefined") return undefined;
  const raw = document.cookie.split("; ").find((row) => row.startsWith("csrf_token="))?.split("=")[1];
  return raw ? decodeURIComponent(raw) : undefined;
}

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const csrf = readCsrf();
    if (csrf) {
      config.headers["X-CSRF-Token"] = csrf;
    }
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean };
    if (!original) return Promise.reject(error);
    if (error.response?.status === 401 && !original._retry && !String(original.url).includes("/auth/refresh")) {
      original._retry = true;
      try {
        const csrf = readCsrf();
        const { data } = await axios.post(
          `${baseURL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true, headers: { "X-CSRF-Token": csrf ?? "" } }
        );
        const token = (data as { data?: { accessToken?: string } })?.data?.accessToken;
        if (token) {
          localStorage.setItem("accessToken", token);
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        }
      } catch {
        localStorage.removeItem("accessToken");
      }
    }
    return Promise.reject(error);
  }
);

export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
};
