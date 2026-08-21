import type { DefaultSession } from "next-auth";
import type { NetworkMemberRole } from "@/types/network";
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
      /** Active tenant context (PC-357). */
      activeNetworkId?: string;
      activeNetworkRole?: NetworkMemberRole;
      isPlatformAdmin?: boolean;
      networkIds?: string[];
      /** Session came from a one-time email login link — skip must-change-password (PC-465). */
      emailLoginSession?: boolean;
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
    activeNetworkId?: string;
    activeNetworkRole?: NetworkMemberRole;
    isPlatformAdmin?: boolean;
    networkIds?: string[];
    emailLoginSession?: boolean;
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
    activeNetworkId?: string;
    activeNetworkRole?: NetworkMemberRole;
    isPlatformAdmin?: boolean;
    networkIds?: string[];
    emailLoginSession?: boolean;
  }
}

export {};
