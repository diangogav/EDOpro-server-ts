import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";

import { BOT_FALLBACK_MS } from "./QueueEntry";
import { BotFallbackPolicy } from "./BotFallbackPolicy";

describe("BotFallbackPolicy", () => {
	it("pairs a participant that has waited past BOT_FALLBACK_MS with a bot", () => {
		const now = Date.now();
		const stale = ParticipantMother.create({
			id: "a",
			userId: "u-a",
			format: "tcg",
			mode: "ranked",
			enqueuedAt: now - BOT_FALLBACK_MS - 1,
			allowBotFallback: true,
		});
		const policy = new BotFallbackPolicy(
			() => true,
			() => "match-1",
		);

		const matches = policy.pair([stale], now);

		expect(matches).toEqual([
			{
				id: "match-1",
				format: "tcg",
				mode: "ranked",
				rated: false,
				opponentKind: "bot",
				participants: [stale],
			},
		]);
	});

	it("does not fall back a participant still inside the wait window", () => {
		const now = Date.now();
		const fresh = ParticipantMother.create({
			enqueuedAt: now - BOT_FALLBACK_MS + 1,
			allowBotFallback: true,
		});
		const policy = new BotFallbackPolicy(
			() => true,
			() => "match-1",
		);

		expect(policy.pair([fresh], now)).toEqual([]);
	});

	it("never falls back when no bot is available", () => {
		const now = Date.now();
		const stale = ParticipantMother.create({
			enqueuedAt: now - BOT_FALLBACK_MS - 1,
			allowBotFallback: true,
		});
		const policy = new BotFallbackPolicy(
			() => false,
			() => "match-1",
		);

		expect(policy.pair([stale], now)).toEqual([]);
	});

	it("creates one bot match per stale participant using the injected id generator", () => {
		const now = Date.now();
		const first = ParticipantMother.create({
			id: "a",
			userId: "u-a",
			enqueuedAt: now - BOT_FALLBACK_MS - 5_000,
			allowBotFallback: true,
		});
		const second = ParticipantMother.create({
			id: "b",
			userId: "u-b",
			enqueuedAt: now - BOT_FALLBACK_MS - 1,
			allowBotFallback: true,
		});
		let nextId = 0;
		const policy = new BotFallbackPolicy(
			() => true,
			() => `match-${++nextId}`,
		);

		const matches = policy.pair([first, second], now);

		expect(matches.map((match) => match.id)).toEqual(["match-1", "match-2"]);
		expect(matches.map((match) => match.participants)).toEqual([[first], [second]]);
	});

	it("never falls back a participant that did not opt in, however long it waits", () => {
		const now = Date.now();
		const declined = ParticipantMother.create({
			enqueuedAt: now - BOT_FALLBACK_MS * 10,
			allowBotFallback: false,
		});
		const policy = new BotFallbackPolicy(
			() => true,
			() => "match-1",
		);

		expect(policy.pair([declined], now)).toEqual([]);
	});

	it("falls back only the opted-in participants among a mixed set", () => {
		const now = Date.now();
		const declined = ParticipantMother.create({
			id: "a",
			enqueuedAt: now - BOT_FALLBACK_MS - 1,
			allowBotFallback: false,
		});
		const opted = ParticipantMother.create({
			id: "b",
			enqueuedAt: now - BOT_FALLBACK_MS - 1,
			allowBotFallback: true,
		});
		const policy = new BotFallbackPolicy(
			() => true,
			() => "match-1",
		);

		const matches = policy.pair([declined, opted], now);

		expect(matches.map((match) => match.participants)).toEqual([[opted]]);
	});
});
