import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { DEFAULT_CATEGORIES } from "./domain/default-categories";

export const SESSION_COOKIE = "kasvo_session";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  locale: string;
  baseCurrency: string;
}

export type RegisterOutcome = "ok" | "taken" | "closed";

const normaliseEmail = (email: string): string => email.toLowerCase().trim();

async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { id: token, userId, expiresAt } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Sign-up is open unless REGISTRATION=closed; a fresh install always accepts its first account. */
export function registrationOpen(): boolean {
  return process.env.REGISTRATION !== "closed";
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  locale: "id" | "en";
}): Promise<RegisterOutcome> {
  const email = normaliseEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  const outcome = await db.$transaction(
    async (tx) => {
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) return "taken" as const;
      if ((await tx.user.count()) > 0 && !registrationOpen()) return "closed" as const;
      const user = await tx.user.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash,
          locale: input.locale,
          timezone: process.env.APP_TIMEZONE ?? "Asia/Jakarta",
          categories: {
            create: DEFAULT_CATEGORIES.map((c) => ({ kind: c.kind, name: c[input.locale] })),
          },
        },
      });
      return user.id;
    },
    { isolationLevel: "Serializable" },
  );
  if (outcome === "taken" || outcome === "closed") return outcome;
  await startSession(outcome);
  return "ok";
}

/** Verifying against this costs the same as a real check, so unknown emails are not faster. */
const DUMMY_DIGEST = hashPassword(randomBytes(16).toString("hex"));

export async function login(email: string, password: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { email: normaliseEmail(email) } });
  if (!user) {
    await verifyPassword(password, await DUMMY_DIGEST);
    return false;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return false;
  await startSession(user.id);
  return true;
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: token } });
  store.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per render. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { id: token },
    include: { user: { select: { id: true, email: true, name: true, locale: true, baseCurrency: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.deleteMany({ where: { id: token } });
    return null;
  }
  return session.user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
