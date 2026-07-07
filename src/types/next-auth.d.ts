import type { DefaultSession } from "next-auth";
import type { UserRole, UserStatus } from "@/types/user";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      accountStatus: Exclude<UserStatus, "deleted">;
      mustChangePassword: boolean;
      onboardingComplete: boolean;
      displayName: string;
      avatarKey?: string;
      theme?: string;
      sessionVersion?: number;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    accountStatus: Exclude<UserStatus, "deleted">;
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
    accountStatus: Exclude<UserStatus, "deleted">;
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
