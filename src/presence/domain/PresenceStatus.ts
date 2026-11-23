export const PRESENCE_STATUSES = ["free", "searching", "in-duel"] as const;

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export function isPresenceStatus(value: unknown): value is PresenceStatus {
	return typeof value === "string" && (PRESENCE_STATUSES as readonly string[]).includes(value);
}
