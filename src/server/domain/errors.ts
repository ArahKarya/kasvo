export type DomainErrorCode = "NOT_FOUND" | "INVALID" | "CONFLICT";

/** Stable reasons the UI translates; agents read `message` and `hint` instead. */
export type DomainErrorReason =
  | "not_found"
  | "name_taken"
  | "archived"
  | "category_kind"
  | "category_nesting"
  | "transfer_locked"
  | "currency_mismatch";

/** An error the caller can show or act on. `hint` tells an agent what to try next. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    readonly reason: DomainErrorReason,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (entity: string, id: string): DomainError =>
  new DomainError("NOT_FOUND", "not_found", `${entity} ${id} not found`, `List ${entity.toLowerCase()}s to find a valid id.`);
