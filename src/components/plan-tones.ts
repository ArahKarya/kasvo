import type { DebtState, InstalmentStatus } from "@/server/domain/debt-math";
import type { GoalState } from "@/server/domain/goal-math";
import type { Tone } from "./status-meter";

export const GOAL_TONE: Record<GoalState, Tone> = { achieved: "good", on_track: "good", behind: "warning", overdue: "critical", open: "neutral" };
export const DEBT_TONE: Record<DebtState, Tone> = { settled: "good", active: "neutral", due_soon: "warning", overdue: "critical" };
export const LINE_TONE: Record<InstalmentStatus, Tone> = { paid: "good", partial: "neutral", upcoming: "neutral", due: "warning", overdue: "critical" };
