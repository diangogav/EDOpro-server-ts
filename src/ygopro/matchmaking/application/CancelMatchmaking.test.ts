import { mock } from "jest-mock-extended";

import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";

import { FifoPairingPolicy } from "../domain/FifoPairingPolicy";
import { Match } from "../domain/Match";
import { MatchHandler } from "../domain/MatchHandler";
import { MatchmakingPool } from "../domain/MatchmakingPool";
import { ParticipantChannel } from "../domain/ParticipantChannel";
import { Session } from "../domain/Session";
import { InMemoryPoolStore } from "../infrastructure/InMemoryPoolStore";
import { CancelMatchmaking } from "./CancelMatchmaking";

class NoopMatchHandler implements MatchHandler {
	handle(_match: Match): void {
		/* not exercised in this suite */
	}
}

describe("CancelMatchmaking", () => {
	let store: InMemoryPoolStore;
	let pool: MatchmakingPool;
	let useCase: CancelMatchmaking;

	beforeEach(() => {
		store = new InMemoryPoolStore();
		pool = new MatchmakingPool({
			store,
			pairingPolicy: new FifoPairingPolicy(() => "match-1"),
			matchHandler: new NoopMatchHandler(),
			now: () => 0,
		});
		useCase = new CancelMatchmaking(pool);
	});

	it("dequeues a queued participant and acknowledges the cancellation", () => {
		const socket = new SocketMock();
		const session = new Session(socket);
		session.queueState = "queued";
		const channel = mock<ParticipantChannel>();
		store.add(ParticipantMother.create({ id: socket.id as string, userId: "user-1", channel }));

		useCase.execute({ socket, session, channel });

		expect(store.get(socket.id as string)).toBeUndefined();
		expect(session.queueState).toBe("idle");
		expect(channel.status).toHaveBeenCalledWith({ state: "cancelled", waitedMs: 0 });
	});

	it("acknowledges an idle cancel idempotently, removing nothing", () => {
		const socket = new SocketMock();
		const session = new Session(socket);
		const channel = mock<ParticipantChannel>();

		useCase.execute({ socket, session, channel });

		expect(channel.status).toHaveBeenCalledWith({ state: "cancelled", waitedMs: 0 });
		expect(session.queueState).toBe("idle");
	});

	it("rejects a cancel that arrives after the participant already matched, leaving the pool untouched", () => {
		const socket = new SocketMock();
		const session = new Session(socket);
		session.queueState = "matched";
		const channel = mock<ParticipantChannel>();
		store.add(ParticipantMother.create({ id: socket.id as string, userId: "user-2" }));

		useCase.execute({ socket, session, channel });

		expect(channel.status).toHaveBeenCalledWith({
			state: "rejected",
			waitedMs: 0,
			reason: "cancel_too_late",
		});
		expect(store.get(socket.id as string)).toBeDefined();
		expect(session.queueState).toBe("matched");
	});
});
