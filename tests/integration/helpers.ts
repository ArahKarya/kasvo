import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { DEFAULT_CATEGORIES } from "@/server/domain/default-categories";
import { userActor, type Actor } from "@/server/domain/actor";

/** A fresh user with the default categories; each test gets its own so they never collide. */
export async function makeUser(): Promise<Actor> {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@kasvo.test`,
      name: "Test",
      passwordHash: "x",
      categories: { create: DEFAULT_CATEGORIES.map((c) => ({ kind: c.kind, name: c.id, icon: c.icon, color: c.color, necessity: c.necessity })) },
    },
  });
  return userActor(user.id);
}

export async function categoryId(actor: Actor, name: string, kind: "INCOME" | "EXPENSE" = "EXPENSE"): Promise<string> {
  const c = await db.category.findFirstOrThrow({ where: { userId: actor.userId, name, kind } });
  return c.id;
}
