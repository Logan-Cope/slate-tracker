/**
 * Auth.js v5 configuration.
 *
 * Two ways in:
 *  - Google: only emails listed in ALLOWED_EMAILS may sign in.
 *  - Passphrase: SITE_PASSPHRASE plus a user picked from the login screen.
 *
 * Sessions are JWTs that last a year and refresh on every visit, so an active
 * user never sees the login screen again.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { createHash, timingSafeEqual } from "node:crypto";
import { createUserFromGoogle, findUserByEmail, findUserByHandle } from "@/lib/db/queries/users";
import { isDemo } from "@/lib/demo/mode";

const YEAR = 60 * 60 * 24 * 365;
const DAY = 60 * 60 * 24;

export function googleEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Clients use SITE_PASSPHRASE. Coaches use COACH_PASSPHRASE, so knowing the
 * shared passphrase does not grant the coach role. In production a coach
 * cannot sign in with a passphrase until COACH_PASSPHRASE is set; in
 * development it falls back to SITE_PASSPHRASE for convenience.
 */
export function passphraseMatches(candidate: string, role: "coach" | "client" = "client"): boolean {
  let expected = process.env.SITE_PASSPHRASE;
  if (role === "coach") {
    expected = process.env.COACH_PASSPHRASE;
    if (!expected && process.env.NODE_ENV !== "production") expected = process.env.SITE_PASSPHRASE;
  }
  if (!expected || expected.length < 8) return false;
  return constantTimeEqual(candidate, expected);
}

const providers: NextAuthConfig["providers"] = [
  Credentials({
    id: "passphrase",
    name: "Passphrase",
    credentials: { handle: {}, passphrase: {} },
    async authorize(credentials) {
      const handle = typeof credentials.handle === "string" ? credentials.handle : "";
      const passphrase = typeof credentials.passphrase === "string" ? credentials.passphrase : "";
      if (!handle || !passphrase) return null;
      const user = await findUserByHandle(handle);
      // Check the passphrase even for unknown handles so timing does not leak which handles exist.
      const ok = passphraseMatches(passphrase, user?.role ?? "client");
      if (!user || !ok) return null;
      return {
        id: String(user.id),
        name: user.name,
        email: user.email ?? undefined,
        role: user.role,
        defaultProfileId: user.defaultProfileId,
      };
    },
  }),
];

// Demo mode: one tap signs in as a seeded user, no passphrase. Never registered outside DEMO_MODE=1.
if (isDemo()) {
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo",
      credentials: { handle: {} },
      async authorize(credentials) {
        const handle = typeof credentials.handle === "string" ? credentials.handle : "";
        const user = handle ? await findUserByHandle(handle) : null;
        if (!user) return null;
        return { id: String(user.id), name: user.name, email: user.email ?? undefined, role: user.role, defaultProfileId: user.defaultProfileId };
      },
    }),
  );
}

if (googleEnabled()) {
  providers.push(Google({ allowDangerousEmailAccountLinking: false }));
}

export const authConfig: NextAuthConfig = {
  providers,
  // `npm run demo` works with no .env.local: a local demo signs its session cookies with a fixed,
  // public value. A deployed demo (production build) still needs AUTH_SECRET.
  secret: process.env.AUTH_SECRET ?? (isDemo() && process.env.NODE_ENV !== "production" ? "local-demo-only" : undefined),
  trustHost: true,
  session: { strategy: "jwt", maxAge: YEAR, updateAge: DAY },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      // Passphrase and demo sign-ins were already validated in authorize().
      if (account?.provider === "passphrase" || account?.provider === "demo") return true;
      if (account?.provider === "google") {
        const email = profile?.email?.toLowerCase();
        // Google must have verified the address, and it must be on our list.
        const verified = profile?.email_verified === true;
        return Boolean(verified && email && allowedEmails().has(email));
      }
      return false;
    },
    async jwt({ token, user, account }) {
      // Only on sign-in. Later calls just pass the token through.
      if (!user) return token;
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase();
        if (!email) throw new Error("Google account has no email");
        const row = (await findUserByEmail(email)) ?? (await createUserFromGoogle(email, user.name ?? email));
        token.uid = row.id;
        token.role = row.role;
        token.defaultProfileId = row.defaultProfileId;
        token.name = row.name;
      } else {
        token.uid = Number(user.id);
        token.role = user.role ?? "client";
        token.defaultProfileId = user.defaultProfileId ?? 1;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.uid ?? "");
      session.user.role = token.role === "coach" ? "coach" : "client";
      session.user.defaultProfileId = typeof token.defaultProfileId === "number" ? token.defaultProfileId : 1;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
