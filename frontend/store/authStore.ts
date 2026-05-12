import { create } from "zustand";

type User = {
  id: string;
  name: string;
  email: string;
  role: "CANDIDATE" | "RECRUITER" | "ADMIN";
};

type AuthState = {
  user: User | null;
  setUser: (u: User | null) => void;
  setAccessToken: (t: string | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  setAccessToken: (t) => {
    if (typeof window === "undefined") return;
    if (t) localStorage.setItem("accessToken", t);
    else localStorage.removeItem("accessToken");
  },
}));
