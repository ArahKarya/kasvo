import "server-only";

import { listAccounts } from "./accounts";
import { listCategories } from "./categories";

/** Active accounts and categories for pickers. */
export async function pickerOptions(userId: string) {
  const [accounts, categories] = await Promise.all([listAccounts(userId), listCategories(userId)]);
  const parentName = new Map(categories.map((c) => [c.id, c.name]));
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    categories: categories.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.parentId ? `${parentName.get(c.parentId) ?? ""} › ${c.name}` : c.name,
    })),
  };
}
