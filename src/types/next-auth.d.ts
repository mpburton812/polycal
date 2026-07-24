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
      /** True when an admin signed in as this user via impersonation (PC-344). */
      isImpersonating?: boolean;
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
    isImpersonating?: boolean;
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
    /** Epoch ms of last DB user-row refresh in the jwt callback (PC-144). */
    dbRefreshedAt?: number;
    isImpersonating?: boolean;
  }
}

export {};
