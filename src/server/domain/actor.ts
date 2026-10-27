/** Who is acting. Every domain write takes one, so the audit log can tell UI and agent apart. */
export interface Actor {
  userId: string;
  kind: "USER" | "AGENT";
  /** MCP client name, for agents. */
  clientName?: string;
}

export const userActor = (userId: string): Actor => ({ userId, kind: "USER" });
