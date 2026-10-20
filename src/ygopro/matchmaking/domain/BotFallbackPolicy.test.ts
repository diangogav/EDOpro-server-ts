import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";

import { BOT_FALLBACK_MAX_MS, BOT_FALLBACK_MIN_MS } from "./QueueEntry";
import { BotFallbackPolicy } from "./BotFallbackPolicy";

describe("BotFallbackPolicy", () => {
	it("pairs a participant that has waited past its fallback delay with a bot", () => {
		const now = Date.now();
		const stale = ParticipantMother.create({
			id: "a",
			userId: "u-a",
			format: "tcg",
			mode: "ranked",
			enqueuedAt: now - BOT_FALLBACK_MIN_MS - 1,
			botFallbackAfterMs: BOT_FALLBACK_MIN_MS,
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

	it("does not fall back a participant still inside its fallback delay", () => {
		const now = Date.now();
		const fresh = ParticipantMother.create({
			enqueuedAt: now - BOT_FALLBACK_MIN_MS + 1,
			botFallbackAfterMs: BOT_FALLBACK_MIN_MS,
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
			enqueuedAt: now - BOT_FALLBACK_MIN_MS - 1,
			botFallbackAfterMs: BOT_FALLBACK_MIN_MS,
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
			enqueuedAt: now - BOT_FALLBACK_MIN_MS - 5_000,
			botFallbackAfterMs: BOT_FALLBACK_MIN_MS,
		});
		const second = ParticipantMother.create({
			id: "b",
			userId: "u-b",
			enqueuedAt: now - BOT_FALLBACK_MIN_MS - 1,
			botFallbackAfterMs: BOT_FALLBACK_MIN_MS,
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

	it("never falls back a participant without a fallback delay, however long it waits", () => {
		const now = Date.now();
		const declined = ParticipantMother.create({ enqueuedAt: now - BOT_FALLBACK_MAX_MS * 10 });
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
			enqueuedAt: now - BOT_FALLBACK_MIN_MS - 1,
		});
		const opted = ParticipantMother.create({
			id: "b",
			enqueuedAt: now - BOT_FALLBACK_MIN_MS - 1,
			botFallbackAfterMs: BOT_FALLBACK_MIN_MS,
		});
		const policy = new BotFallbackPolicy(
			() => true,
			() => "match-1",
		);

		const matches = policy.pair([declined, opted], now);

		expect(matches.map((match) => match.participants)).toEqual([[opted]]);
	});

	it("honors a delay longer than the minimum", () => {
		const now = Date.now();
		const delay = BOT_FALLBACK_MIN_MS * 2;
		const policy = new BotFallbackPolicy(
			() => true,
			() => "match-1",
		);
		const early = ParticipantMother.create({
			enqueuedAt: now - delay + 1,
			botFallbackAfterMs: delay,
		});
		const late = ParticipantMother.create({
			enqueuedAt: now - delay - 1,
			botFallbackAfterMs: delay,
		});

		expect(policy.pair([early], now)).toEqual([]);
		expect(policy.pair([late], now)).toHaveLength(1);
	});

	it("raises a delay below the minimum to the minimum", () => {
		const now = Date.now();
		const policy = new BotFallbackPolicy(
			() => true,
			() => "match-1",
		);
		const early = ParticipantMother.create({
			enqueuedAt: now - BOT_FALLBACK_MIN_MS + 1,
			botFallbackAfterMs: 0,
		});
		const late = ParticipantMother.create({
			enqueuedAt: now - BOT_FALLBACK_MIN_MS - 1,
			botFallbackAfterMs: 0,
		});

		expect(policy.pair([early], now)).toEqual([]);
		expect(policy.pair([late], now)).toHaveLength(1);
	});

	it("caps a delay above the maximum to the maximum", () => {
		const now = Date.now();
		const policy = new BotFallbackPolicy(
			() => true,
			() => "match-1",
		);
		const participant = ParticipantMother.create({
			enqueuedAt: now - BOT_FALLBACK_MAX_MS - 1,
			botFallbackAfterMs: BOT_FALLBACK_MAX_MS * 100,
		});

		expect(policy.pair([participant], now)).toHaveLength(1);
	});
});
