import type { DefaultSession } from "next-auth";
// Importing the module makes the augmentation below attach to it.
import "next-auth/jwt";

type Role = "coach" | "client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      defaultProfileId: number;
    } & DefaultSession["user"];
  }
  interface User {
    role?: Role;
    defaultProfileId?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: number;
    role?: Role;
    defaultProfileId?: number;
  }
}
