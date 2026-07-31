import { serializeCoreLaunchPayload } from "./serialize-core-launch-payload";

const SEEDS: bigint[] = [12345678901234567890n, 18446744073709551615n, 9007199254740993n, 7n];

const createPayload = (players: unknown[] = []) => ({
	config: {
		startLp: "8000",
		seeds: SEEDS,
		flags: 190464,
		lp: 8000,
		startingDrawCount: 5,
		drawCountPerTurn: 1,
		firstToPlay: 0,
		timeLimit: 240,
	},
	players,
});

describe("serializeCoreLaunchPayload", () => {
	it("serializes 64-bit seeds as exact JSON integers", () => {
		const json = serializeCoreLaunchPayload(createPayload());

		expect(json).toContain(
			'"seeds":[12345678901234567890,18446744073709551615,9007199254740993,7]',
		);
	});

	it("produces valid JSON with the rest of the config intact", () => {
		const json = serializeCoreLaunchPayload(createPayload());

		const parsed = JSON.parse(json) as { config: Record<string, unknown> };

		expect(parsed.config.startLp).toBe("8000");
		expect(parsed.config.flags).toBe(190464);
		expect(parsed.config.timeLimit).toBe(240);
	});

	it("serializes players untouched", () => {
		const players = [{ team: 0, mainDeck: [10000, 10001], sideDeck: [], extraDeck: [], turn: 0 }];

		const json = serializeCoreLaunchPayload(createPayload(players));

		const parsed = JSON.parse(json) as { players: unknown[] };

		expect(parsed.players).toEqual(players);
	});

	it("is not corrupted by player fields containing the exact seeds placeholder", () => {
		const maliciousName = '__SEEDS_PLACEHOLDER__"]},"x":[';
		const players = [
			{ team: 0, name: maliciousName, mainDeck: [], sideDeck: [], extraDeck: [], turn: 0 },
		];

		const json = serializeCoreLaunchPayload(createPayload(players));

		const parsed = JSON.parse(json) as { players: Array<{ name: string }> };

		expect(parsed.players[0]!.name).toBe(maliciousName);
		expect(json).toContain('"seeds":[12345678901234567890');
	});
});
