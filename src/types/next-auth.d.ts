import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/types/user";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      mustChangePassword: boolean;
      onboardingComplete: boolean;
      displayName: string;
      avatarKey?: string;
      theme?: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    mustChangePassword: boolean;
    onboardingComplete: boolean;
    sessionVersion: number;
    displayName: string;
    avatarKey?: string;
    theme?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    mustChangePassword: boolean;
    onboardingComplete: boolean;
    sessionVersion: number;
    displayName: string;
    avatarKey?: string;
    theme?: string;
    error?: string;
  }
}

export {};
