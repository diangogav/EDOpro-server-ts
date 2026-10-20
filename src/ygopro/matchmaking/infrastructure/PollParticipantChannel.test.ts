import { MatchFoundNotice } from "../domain/ParticipantChannel";
import { QueueEntry, QUEUE_TTL_MS } from "../domain/QueueEntry";

import { PollParticipantChannel } from "./PollParticipantChannel";

const makeRecord = (overrides: Partial<QueueEntry> = {}): QueueEntry => ({
	ticketId: "t1",
	userId: "user-1",
	format: "tcg",
	displayName: null,
	enteredAt: 0,
	lastPollAt: 0,
	state: "searching",
	...overrides,
});

const makeNotice = (overrides: Partial<MatchFoundNotice> = {}): MatchFoundNotice => ({
	matchId: "match-1",
	roomId: 42,
	roomPassword: "to,mm-r1#pw1",
	opponentType: "human",
	rated: true,
	opponentName: "Kaiba",
	...overrides,
});

describe("PollParticipantChannel", () => {
	describe("status", () => {
		it("is a no-op that never mutates the record", () => {
			const record = makeRecord();
			const channel = new PollParticipantChannel(record, () => 0);

			channel.status({ state: "searching", waitedMs: 5_000 });

			expect(record).toEqual(makeRecord());
		});
	});

	describe("found", () => {
		it("mutates the record with the match outcome and sends no frame", () => {
			const record = makeRecord();
			const channel = new PollParticipantChannel(record, () => 0);

			channel.found(makeNotice());

			expect(record).toMatchObject({
				state: "matched",
				roomId: 42,
				roomPassword: "to,mm-r1#pw1",
				opponentType: "human",
				rated: true,
				opponentName: "Kaiba",
			});
		});

		it("records an explicit null opponentName for a bot match", () => {
			const record = makeRecord();
			const channel = new PollParticipantChannel(record, () => 0);

			channel.found(makeNotice({ opponentType: "bot", rated: false, opponentName: null }));

			expect(record).toMatchObject({ state: "matched", opponentType: "bot", opponentName: null });
		});
	});

	describe("isAlive", () => {
		it("is alive while within the TTL window measured from lastPollAt", () => {
			const record = makeRecord({ lastPollAt: 1_000 });
			const channel = new PollParticipantChannel(record, () => 0);

			expect(channel.isAlive(1_000 + QUEUE_TTL_MS)).toBe(true);
		});

		it("is dead once the TTL window elapses past lastPollAt", () => {
			const record = makeRecord({ lastPollAt: 1_000 });
			const channel = new PollParticipantChannel(record, () => 0);

			expect(channel.isAlive(1_000 + QUEUE_TTL_MS + 1)).toBe(false);
		});
	});

	describe("close", () => {
		it("sends no frame; the poll leg has nothing to push to", () => {
			const record = makeRecord();
			const channel = new PollParticipantChannel(record, () => 0);

			expect(() => channel.close("replaced_by_new_connection")).not.toThrow();
			expect(record.state).toBe("searching");
		});
	});
});
