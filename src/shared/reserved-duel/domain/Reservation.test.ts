import { parseReservation, reservationKey } from "./Reservation";

const ID = "Ab3dEf6hIj9kLm2n";

const makePayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
	v: 1,
	reservationId: ID,
	format: "edison",
	mode: "single",
	participants: [
		{
			seat: 0,
			kind: "user",
			userId: "user-1",
			requiredDeck: { main: [12345678], extra: [87654321], side: [] },
		},
		{ seat: 1, kind: "windbot", botName: "Haunted" },
	],
	options: {
		spectators: false,
		listed: false,
		reconnect: false,
		deckLock: "exact",
		lobbyTimeoutSeconds: 120,
	},
	claim: null,
	...overrides,
});

const parse = (overrides: Record<string, unknown> = {}) =>
	parseReservation(JSON.stringify(makePayload(overrides)));

describe("parseReservation", () => {
	it("reads a one-human-against-a-bot reservation", () => {
		expect(parse()).toEqual({
			id: ID,
			format: "edison",
			mode: "single",
			participants: [
				{
					seat: 0,
					kind: "user",
					userId: "user-1",
					requiredDeck: { main: [12345678], extra: [87654321], side: [] },
				},
				{ seat: 1, kind: "windbot", botName: "Haunted" },
			],
			options: {
				spectators: false,
				listed: false,
				reconnect: false,
				deckLock: "exact",
				lobbyTimeoutSeconds: 120,
			},
		});
	});

	it("reads two human seats in match mode, ordered by seat, without decks", () => {
		const reservation = parse({
			mode: "match",
			participants: [
				{ seat: 1, kind: "user", userId: "user-2" },
				{ seat: 0, kind: "user", userId: "user-1" },
			],
		});

		expect(reservation?.mode).toBe("match");
		expect(reservation?.participants.map((p) => p.seat)).toEqual([0, 1]);
		expect(reservation?.participants[0]).toEqual({
			seat: 0,
			kind: "user",
			userId: "user-1",
			requiredDeck: null,
		});
	});

	it("reads an empty list the claim script re-encoded as an empty object", () => {
		const reservation = parse({
			participants: [
				{
					seat: 0,
					kind: "user",
					userId: "user-1",
					requiredDeck: { main: [1], extra: {}, side: {} },
				},
				{ seat: 1, kind: "windbot", botName: "Haunted" },
			],
		});

		expect(reservation?.participants[0]).toMatchObject({
			requiredDeck: { main: [1], extra: [], side: [] },
		});
	});

	it("defaults missing options to a closed, exact-locked room with a 120 s lobby", () => {
		expect(parse({ options: undefined })?.options).toEqual({
			spectators: false,
			listed: false,
			reconnect: false,
			deckLock: "exact",
			lobbyTimeoutSeconds: 120,
		});
	});

	it.each([
		["an unknown version", { v: 2 }],
		["a malformed id", { reservationId: "short" }],
		["an unknown mode", { mode: "tag" }],
		["an unknown deck lock", { options: { deckLock: "loose" } }],
		["a non-positive lobby timeout", { options: { lobbyTimeoutSeconds: 0 } }],
		[
			"two participants on one seat",
			{
				participants: [
					{ seat: 0, kind: "user", userId: "a" },
					{ seat: 0, kind: "user", userId: "b" },
				],
			},
		],
		[
			"no human seat",
			{
				participants: [
					{ seat: 0, kind: "windbot", botName: "A" },
					{ seat: 1, kind: "windbot", botName: "B" },
				],
			},
		],
		[
			"a seat outside 0/1",
			{
				participants: [
					{ seat: 2, kind: "user", userId: "a" },
					{ seat: 1, kind: "windbot", botName: "B" },
				],
			},
		],
		[
			"a malformed required deck",
			{
				participants: [
					{
						seat: 0,
						kind: "user",
						userId: "a",
						requiredDeck: { main: ["x"], extra: [], side: [] },
					},
					{ seat: 1, kind: "windbot", botName: "B" },
				],
			},
		],
	])("rejects %s", (_name, overrides) => {
		expect(parse(overrides as Record<string, unknown>)).toBeNull();
	});

	it("rejects text that is not JSON", () => {
		expect(parseReservation("not json")).toBeNull();
	});
});

describe("reservationKey", () => {
	it("is the key the issuer writes and revokes", () => {
		expect(reservationKey(ID)).toBe(`duel:reservation:${ID}`);
	});
});
