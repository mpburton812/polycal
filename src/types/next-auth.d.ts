import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/types/user";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      mustChangePassword: boolean;
      displayName: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    mustChangePassword: boolean;
    displayName: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    mustChangePassword: boolean;
    displayName: string;
  }
}

export {};
