import { mock } from "jest-mock-extended";

import { mercuryConfig } from "@ygopro/config";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";

import { FifoPairingPolicy } from "../domain/FifoPairingPolicy";
import { Match } from "../domain/Match";
import { MatchHandler } from "../domain/MatchHandler";
import { MatchmakingPool } from "../domain/MatchmakingPool";
import { ParticipantChannel, RejectionReason } from "../domain/ParticipantChannel";
import { Session } from "../domain/Session";
import { InMemoryPoolStore } from "../infrastructure/InMemoryPoolStore";
import { EnterMatchmaking } from "./EnterMatchmaking";

class RecordingMatchHandler implements MatchHandler {
	public readonly handled: Match[] = [];

	handle(match: Match): void {
		this.handled.push(match);
	}
}

const PLAYER_INFO_BODY = Buffer.from("Player1", "utf16le");

function makeConnection(options?: { authenticated?: boolean; playerInfo?: boolean }) {
	const socket = new SocketMock();
	const session = new Session(socket);
	if (options?.authenticated ?? true) {
		session.authenticate("user-1", "Yugi");
	}
	if (options?.playerInfo ?? true) {
		session.capturePlayerInfo(PLAYER_INFO_BODY);
	}
	const channel = mock<ParticipantChannel>();
	channel.isAlive.mockReturnValue(true);

	return { socket, session, channel };
}

describe("EnterMatchmaking", () => {
	let store: InMemoryPoolStore;
	let matchHandler: RecordingMatchHandler;
	let pool: MatchmakingPool;
	let useCase: EnterMatchmaking;
	let now: number;

	beforeEach(() => {
		store = new InMemoryPoolStore();
		matchHandler = new RecordingMatchHandler();
		now = 1_000;
		pool = new MatchmakingPool({
			store,
			pairingPolicy: new FifoPairingPolicy(() => "match-1"),
			matchHandler,
			now: () => now,
		});
		useCase = new EnterMatchmaking(pool, () => now);
	});

	describe("guards", () => {
		it.each([
			{
				name: "rejects ENTER before AUTH and leaves the connection open",
				options: { authenticated: false },
				clientVersion: mercuryConfig.version,
				reason: "not_authenticated" as RejectionReason,
				expectClose: false,
			},
			{
				name: "rejects ENTER with no captured PLAYER_INFO",
				options: { playerInfo: false },
				clientVersion: mercuryConfig.version,
				reason: "missing_player_info" as RejectionReason,
				expectClose: false,
			},
			{
				name: "rejects and closes on a client version mismatch",
				options: {},
				clientVersion: mercuryConfig.version + 1,
				reason: "version_mismatch" as RejectionReason,
				expectClose: true,
			},
			{
				name: "the not-authenticated guard wins over a missing PLAYER_INFO and a bad version",
				options: { authenticated: false, playerInfo: false },
				clientVersion: mercuryConfig.version + 1,
				reason: "not_authenticated" as RejectionReason,
				expectClose: false,
			},
			{
				name: "the missing-PLAYER_INFO guard wins over a bad version",
				options: { playerInfo: false },
				clientVersion: mercuryConfig.version + 1,
				reason: "missing_player_info" as RejectionReason,
				expectClose: false,
			},
		])("$name", ({ options, clientVersion, reason, expectClose }) => {
			const { socket, session, channel } = makeConnection(options);

			useCase.execute({ socket, session, channel, format: "tcg", mode: "ranked", clientVersion });

			if (expectClose) {
				expect(channel.close).toHaveBeenCalledWith(reason);
			} else {
				expect(channel.status).toHaveBeenCalledWith({ state: "rejected", waitedMs: 0, reason });
				expect(channel.close).not.toHaveBeenCalled();
			}
			expect(store.depth("tcg", "ranked")).toBe(0);
			expect(session.queueState).toBe("idle");
		});

		it("rejects ENTER when the session is already queued, without touching the pool", () => {
			const { socket, session, channel } = makeConnection();
			session.queueState = "queued";

			useCase.execute({
				socket,
				session,
				channel,
				format: "tcg",
				mode: "ranked",
				clientVersion: mercuryConfig.version,
			});

			expect(channel.status).toHaveBeenCalledWith({
				state: "rejected",
				waitedMs: 0,
				reason: "already_queued",
			});
			expect(channel.close).not.toHaveBeenCalled();
			expect(store.depth("tcg", "ranked")).toBe(0);
		});
	});

	describe("on success", () => {
		it("adds a socket participant to the pool, marks the session queued, and pushes an immediate searching status", () => {
			const { socket, session, channel } = makeConnection();

			useCase.execute({
				socket,
				session,
				channel,
				format: "tcg",
				mode: "ranked",
				clientVersion: mercuryConfig.version,
			});

			const participant = store.get(socket.id as string);
			expect(participant).toMatchObject({
				userId: "user-1",
				format: "tcg",
				mode: "ranked",
				displayName: "Yugi",
				presence: "socket",
			});
			expect(session.queueState).toBe("queued");
			expect(channel.status).toHaveBeenCalledWith({ state: "searching", waitedMs: 0 });
		});

		it("runs an opportunistic tick that can pair with an already-queued compatible participant", () => {
			const waiting = ParticipantMother.create({
				id: "waiting",
				userId: "u-waiting",
				format: "tcg",
				mode: "ranked",
				enqueuedAt: 0,
			});
			pool.add(waiting);
			const { socket, session, channel } = makeConnection();

			useCase.execute({
				socket,
				session,
				channel,
				format: "tcg",
				mode: "ranked",
				clientVersion: mercuryConfig.version,
			});

			expect(matchHandler.handled).toHaveLength(1);
			expect(matchHandler.handled[0].participants.map((participant) => participant.id)).toEqual([
				"waiting",
				socket.id,
			]);
		});
	});
});
