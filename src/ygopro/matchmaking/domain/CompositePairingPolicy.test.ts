import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";

import { BOT_FALLBACK_MS } from "./QueueEntry";
import { BotFallbackPolicy } from "./BotFallbackPolicy";
import { CompositePairingPolicy } from "./CompositePairingPolicy";
import { FifoPairingPolicy } from "./FifoPairingPolicy";
import { Match } from "./Match";
import { PairingPolicy } from "./PairingPolicy";

describe("CompositePairingPolicy", () => {
	it("runs FIFO first, then bot fallback over the remainder", () => {
		const now = Date.now();
		const human1 = ParticipantMother.create({
			id: "a",
			userId: "u-a",
			enqueuedAt: now - BOT_FALLBACK_MS - 5_000,
		});
		const human2 = ParticipantMother.create({
			id: "b",
			userId: "u-b",
			enqueuedAt: now - BOT_FALLBACK_MS - 4_000,
		});
		const stale = ParticipantMother.create({
			id: "c",
			userId: "u-c",
			enqueuedAt: now - BOT_FALLBACK_MS - 1,
		});
		let nextId = 0;
		const newMatchId = () => `match-${++nextId}`;
		const policy = new CompositePairingPolicy([
			new FifoPairingPolicy(newMatchId),
			new BotFallbackPolicy(() => true, newMatchId),
		]);

		const matches = policy.pair([human1, human2, stale], now);

		expect(matches).toHaveLength(2);
		expect(matches[0].participants).toEqual([human1, human2]);
		expect(matches[0].opponentKind).toBe("human");
		expect(matches[1].participants).toEqual([stale]);
		expect(matches[1].opponentKind).toBe("bot");
	});

	it("never assigns a participant already matched by an earlier policy", () => {
		const now = Date.now();
		const human1 = ParticipantMother.create({
			id: "a",
			userId: "u-a",
			enqueuedAt: now - BOT_FALLBACK_MS - 1,
		});
		const human2 = ParticipantMother.create({
			id: "b",
			userId: "u-b",
			enqueuedAt: now - BOT_FALLBACK_MS - 1,
		});
		let nextId = 0;
		const newMatchId = () => `match-${++nextId}`;
		const policy = new CompositePairingPolicy([
			new FifoPairingPolicy(newMatchId),
			new BotFallbackPolicy(() => true, newMatchId),
		]);

		const matches = policy.pair([human1, human2], now);

		expect(matches).toHaveLength(1);
		expect(matches[0].participants).toEqual([human1, human2]);
		expect(matches[0].opponentKind).toBe("human");
	});

	it("passes only the unmatched remainder to each subsequent policy", () => {
		const now = Date.now();
		const participant = ParticipantMother.create({ id: "a", userId: "u-a", enqueuedAt: now });
		const seenByFirst: string[][] = [];
		const seenBySecond: string[][] = [];
		const firstPolicy: PairingPolicy = {
			pair: (candidates): readonly Match[] => {
				seenByFirst.push(candidates.map((c) => c.id));
				return [];
			},
		};
		const secondPolicy: PairingPolicy = {
			pair: (candidates): readonly Match[] => {
				seenBySecond.push(candidates.map((c) => c.id));
				return [];
			},
		};
		const policy = new CompositePairingPolicy([firstPolicy, secondPolicy]);

		policy.pair([participant], now);

		expect(seenByFirst).toEqual([["a"]]);
		expect(seenBySecond).toEqual([["a"]]);
	});

	it("returns no matches when it has no policies", () => {
		const policy = new CompositePairingPolicy([]);

		expect(policy.pair([ParticipantMother.create()], Date.now())).toEqual([]);
	});
});
