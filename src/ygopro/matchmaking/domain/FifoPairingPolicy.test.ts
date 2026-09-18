import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";

import { FifoPairingPolicy } from "./FifoPairingPolicy";

describe("FifoPairingPolicy", () => {
	it("pairs the two earliest-queued participants first", () => {
		const now = Date.now();
		const first = ParticipantMother.create({ id: "a", userId: "u-a", enqueuedAt: now - 3_000 });
		const second = ParticipantMother.create({ id: "b", userId: "u-b", enqueuedAt: now - 2_000 });
		const third = ParticipantMother.create({ id: "c", userId: "u-c", enqueuedAt: now - 1_000 });
		let nextId = 0;
		const policy = new FifoPairingPolicy(() => `match-${++nextId}`);

		const matches = policy.pair([third, first, second], now);

		expect(matches).toHaveLength(1);
		expect(matches[0].participants).toEqual([first, second]);
	});

	it("marks a paired match as rated human vs human", () => {
		const now = Date.now();
		const first = ParticipantMother.create({
			id: "a",
			userId: "u-a",
			format: "jtp",
			mode: "ranked",
			enqueuedAt: now - 1_000,
		});
		const second = ParticipantMother.create({
			id: "b",
			userId: "u-b",
			format: "jtp",
			mode: "ranked",
			enqueuedAt: now,
		});
		const policy = new FifoPairingPolicy(() => "match-1");

		const [match] = policy.pair([first, second], now);

		expect(match).toEqual({
			id: "match-1",
			format: "jtp",
			mode: "ranked",
			rated: true,
			opponentKind: "human",
			participants: [first, second],
		});
	});

	it("leaves an odd participant out unmatched", () => {
		const now = Date.now();
		const first = ParticipantMother.create({ id: "a", userId: "u-a", enqueuedAt: now - 2_000 });
		const second = ParticipantMother.create({ id: "b", userId: "u-b", enqueuedAt: now - 1_000 });
		const third = ParticipantMother.create({ id: "c", userId: "u-c", enqueuedAt: now });
		const policy = new FifoPairingPolicy(() => "match-1");

		const matches = policy.pair([first, second, third], now);

		expect(matches).toHaveLength(1);
		expect(matches[0].participants).toEqual([first, second]);
	});

	it("uses the injected id generator deterministically for every match", () => {
		const now = Date.now();
		const a = ParticipantMother.create({ id: "a", userId: "u-a", enqueuedAt: now - 4_000 });
		const b = ParticipantMother.create({ id: "b", userId: "u-b", enqueuedAt: now - 3_000 });
		const c = ParticipantMother.create({ id: "c", userId: "u-c", enqueuedAt: now - 2_000 });
		const d = ParticipantMother.create({ id: "d", userId: "u-d", enqueuedAt: now - 1_000 });
		let nextId = 0;
		const policy = new FifoPairingPolicy(() => `match-${++nextId}`);

		const matches = policy.pair([a, b, c, d], now);

		expect(matches.map((match) => match.id)).toEqual(["match-1", "match-2"]);
	});

	it("returns no matches for an empty candidate list", () => {
		const policy = new FifoPairingPolicy(() => "match-1");

		expect(policy.pair([], Date.now())).toEqual([]);
	});
});
