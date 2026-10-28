/**
 * A reserved duel: a room the server builds from a reservation someone else
 * wrote ahead of time, instead of from a client's join string. The reservation
 * fixes who sits where, which deck each user must bring and how the room
 * behaves; the server only claims it, plays it and records the outcome under
 * the reservation id.
 */

export type ReservationMode = "single" | "match";
export type DeckLockKind = "exact" | "registered";

export type RequiredDeck = {
	readonly main: readonly number[];
	readonly extra: readonly number[];
	readonly side: readonly number[];
};

export type UserParticipant = {
	readonly seat: number;
	readonly kind: "user";
	readonly userId: string;
	readonly requiredDeck: RequiredDeck | null;
};

export type WindbotParticipant = {
	readonly seat: number;
	readonly kind: "windbot";
	readonly botName: string;
};

export type ReservationParticipant = UserParticipant | WindbotParticipant;

export type ReservationOptions = {
	readonly spectators: boolean;
	readonly listed: boolean;
	readonly reconnect: boolean;
	readonly deckLock: DeckLockKind;
	readonly lobbyTimeoutSeconds: number;
};

export type Reservation = {
	readonly id: string;
	readonly format: string;
	readonly mode: ReservationMode;
	readonly participants: readonly ReservationParticipant[];
	readonly options: ReservationOptions;
};

/** First segment of the join password: "rv#<id>". */
export const RESERVATION_COMMAND = "rv";
export const RESERVATION_ID_PATTERN = /^[0-9A-Za-z]{16}$/;
export const RESERVATION_VERSION = 1;
export const DEFAULT_LOBBY_TIMEOUT_SECONDS = 120;

/** Redis key shared with whoever issues and revokes reservations. */
export function reservationKey(id: string): string {
	return `duel:reservation:${id}`;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Redis' cjson re-encodes an empty array as an empty object once the claim
// script has rewritten the payload, so both shapes read as an empty list.
function asList(value: unknown): unknown[] | null {
	if (Array.isArray(value)) {
		return value;
	}
	if (isObject(value) && Object.keys(value).length === 0) {
		return [];
	}

	return null;
}

function asCardList(value: unknown): number[] | null {
	const list = asList(value ?? []);
	if (!list || !list.every((code) => Number.isInteger(code) && (code as number) > 0)) {
		return null;
	}

	return list as number[];
}

function parseRequiredDeck(value: unknown): RequiredDeck | null | undefined {
	if (value === undefined || value === null) {
		return null;
	}
	if (!isObject(value)) {
		return undefined;
	}
	const main = asCardList(value.main);
	const extra = asCardList(value.extra);
	const side = asCardList(value.side);
	if (!main || !extra || !side) {
		return undefined;
	}

	return { main, extra, side };
}

function parseParticipant(value: unknown): ReservationParticipant | null {
	if (!isObject(value) || (value.seat !== 0 && value.seat !== 1)) {
		return null;
	}
	if (value.kind === "user" && typeof value.userId === "string" && value.userId !== "") {
		const requiredDeck = parseRequiredDeck(value.requiredDeck);
		if (requiredDeck === undefined) {
			return null;
		}

		return { seat: value.seat, kind: "user", userId: value.userId, requiredDeck };
	}
	if (value.kind === "windbot" && typeof value.botName === "string" && value.botName !== "") {
		return { seat: value.seat, kind: "windbot", botName: value.botName };
	}

	return null;
}

function parseOptions(value: unknown): ReservationOptions | null {
	const options = isObject(value) ? value : {};
	const deckLock = options.deckLock ?? "exact";
	if (deckLock !== "exact" && deckLock !== "registered") {
		return null;
	}
	const timeout = options.lobbyTimeoutSeconds ?? DEFAULT_LOBBY_TIMEOUT_SECONDS;
	if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
		return null;
	}

	return {
		spectators: options.spectators === true,
		listed: options.listed === true,
		reconnect: options.reconnect === true,
		deckLock,
		lobbyTimeoutSeconds: timeout,
	};
}

/**
 * Reads a stored reservation. Anything the server cannot honour exactly
 * (unknown version, a seat other than 0/1, two participants on one seat, no
 * human at all, a malformed deck) yields null: a reservation is never played
 * half-understood.
 */
export function parseReservation(raw: string): Reservation | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isObject(value) || value.v !== RESERVATION_VERSION) {
		return null;
	}
	if (
		typeof value.reservationId !== "string" ||
		!RESERVATION_ID_PATTERN.test(value.reservationId)
	) {
		return null;
	}
	if (typeof value.format !== "string" || value.format === "") {
		return null;
	}
	if (value.mode !== "single" && value.mode !== "match") {
		return null;
	}

	const participants = (asList(value.participants) ?? []).map(parseParticipant);
	if (participants.length !== 2 || participants.some((participant) => participant === null)) {
		return null;
	}
	const seated = participants as ReservationParticipant[];
	if (seated[0].seat === seated[1].seat || !seated.some((p) => p.kind === "user")) {
		return null;
	}

	const options = parseOptions(value.options);
	if (!options) {
		return null;
	}

	return {
		id: value.reservationId,
		format: value.format.toLowerCase(),
		mode: value.mode,
		participants: [...seated].sort((a, b) => a.seat - b.seat),
		options,
	};
}
