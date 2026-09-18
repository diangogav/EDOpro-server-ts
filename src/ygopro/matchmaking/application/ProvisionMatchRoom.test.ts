import { mock } from "jest-mock-extended";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";

import { Logger } from "@shared/logger/domain/Logger";
import { RoomIdGenerator } from "@ygopro/room/domain/RoomIdGenerator";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";

import { Match } from "../domain/Match";
import { Participant } from "../domain/Participant";
import { ParticipantChannel } from "../domain/ParticipantChannel";
import { createMatchmakingRoom } from "./MatchmakingRoomFactory";
import { ProvisionMatchRoom } from "./ProvisionMatchRoom";

jest.mock("./MatchmakingRoomFactory", () => ({ createMatchmakingRoom: jest.fn() }));

const createMatchmakingRoomMock = createMatchmakingRoom as jest.Mock;

const makeLogger = () =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as unknown as jest.Mocked<Logger>;

function makePlayerInfo(name: string): PlayerInfoMessage {
	const buffer = Buffer.from(name, "utf16le");
	return new PlayerInfoMessage(buffer, buffer.length);
}

function makeSocketParticipant(overrides?: Partial<Participant>): Participant {
	const socket = new SocketMock();
	return ParticipantMother.create({
		presence: "socket",
		channel: mock<ParticipantChannel>(),
		admission: { socket, playerInfo: makePlayerInfo("Yugi") },
		...overrides,
	});
}

function makeFakeRoom(id: number) {
	const room = { id, emit: jest.fn() } as unknown as jest.Mocked<Pick<YGOProRoom, "id" | "emit">>;
	return { room, roomPassword: `tt,mm${id}#1234567` };
}

function makeMatch(overrides: Partial<Match> & Pick<Match, "id" | "participants">): Match {
	return { format: "tcg", mode: "ranked", rated: true, opponentKind: "human", ...overrides };
}

describe("ProvisionMatchRoom", () => {
	let roomIdGenerator: jest.Mocked<RoomIdGenerator>;
	let pool: { add: jest.Mock };
	let spawnBot: jest.Mock;
	let logger: jest.Mocked<Logger>;
	let provision: ProvisionMatchRoom;

	beforeEach(() => {
		createMatchmakingRoomMock.mockReset();
		roomIdGenerator = { next: jest.fn().mockReturnValue(4242) };
		pool = { add: jest.fn() };
		spawnBot = jest.fn();
		logger = makeLogger();
		provision = new ProvisionMatchRoom({ logger, roomIdGenerator, pool, spawnBot });
	});

	it.each([
		{
			name: "reserves exactly the match's userIds and creates a ranked human-pair room",
			participants: () => [
				makeSocketParticipant({ userId: "user-a" }),
				makeSocketParticipant({ userId: "user-b" }),
			],
			opponentKind: "human" as const,
			expected: { matchMode: true, rankedOverride: true, reservedUserIds: ["user-a", "user-b"] },
		},
		{
			name: "reserves only the human and creates an unrated single-duel room for a bot match",
			participants: () => [makeSocketParticipant({ userId: "user-a" })],
			opponentKind: "bot" as const,
			expected: { matchMode: false, rankedOverride: false, reservedUserIds: ["user-a"] },
		},
	])("$name", ({ participants, opponentKind, expected }) => {
		const { room, roomPassword } = makeFakeRoom(5150);
		createMatchmakingRoomMock.mockReturnValue({ room, roomPassword });
		const match = makeMatch({ id: "match-1", opponentKind, participants: participants() });

		provision.handle(match);

		expect(createMatchmakingRoomMock).toHaveBeenCalledWith(
			expect.objectContaining({ ...expected, format: "tcg", roomIdGenerator }),
		);
		if (opponentKind === "bot") {
			expect(spawnBot).toHaveBeenCalledWith(5150, "tcg");
		}
	});

	it("sends FOUND to every participant before admitting any socket participant", () => {
		const a = makeSocketParticipant({ userId: "user-a", displayName: "Yugi" });
		const b = makeSocketParticipant({ userId: "user-b", displayName: "Kaiba" });
		const { room, roomPassword } = makeFakeRoom(7000);
		createMatchmakingRoomMock.mockReturnValue({ room, roomPassword });
		const callOrder: string[] = [];
		(a.channel.found as jest.Mock).mockImplementation(() => callOrder.push("found:a"));
		(b.channel.found as jest.Mock).mockImplementation(() => callOrder.push("found:b"));
		room.emit.mockImplementation(() => callOrder.push("admit"));

		provision.handle(makeMatch({ id: "match-3", participants: [a, b] }));

		expect(a.channel.found).toHaveBeenCalledWith({
			matchId: "match-3",
			roomId: 7000,
			roomPassword,
			opponentType: "human",
			rated: true,
			opponentName: "Kaiba",
		});
		expect(b.channel.found).toHaveBeenCalledWith(expect.objectContaining({ opponentName: "Yugi" }));
		expect(callOrder).toEqual(["found:a", "found:b", "admit", "admit"]);
		expect(room.emit).toHaveBeenCalledWith(
			"MATCH_ADMIT",
			a.admission?.playerInfo,
			a.admission?.socket,
		);
		expect(room.emit).toHaveBeenCalledWith(
			"MATCH_ADMIT",
			b.admission?.playerInfo,
			b.admission?.socket,
		);
		expect(logger.info).toHaveBeenCalledWith(
			"matchmaking.room_provisioned",
			expect.objectContaining({ matchId: "match-3", roomId: 7000 }),
		);
	});

	it("delivers the roomPassword to a poll participant through found and never admits it", () => {
		const human = makeSocketParticipant({ userId: "user-a" });
		const poller = ParticipantMother.create({
			userId: "user-b",
			presence: "poll",
			channel: mock<ParticipantChannel>(),
		});
		const { room, roomPassword } = makeFakeRoom(8000);
		createMatchmakingRoomMock.mockReturnValue({ room, roomPassword });

		provision.handle(makeMatch({ id: "match-4", participants: [human, poller] }));

		expect(poller.channel.found).toHaveBeenCalledWith(expect.objectContaining({ roomPassword }));
		expect(room.emit).toHaveBeenCalledTimes(1);
		expect(room.emit).toHaveBeenCalledWith(
			"MATCH_ADMIT",
			human.admission?.playerInfo,
			human.admission?.socket,
		);
	});

	it("contains a room-creation failure per match, re-queues both participants, and creates no room", () => {
		const a = makeSocketParticipant({ userId: "user-a" });
		const b = makeSocketParticipant({ userId: "user-b" });
		createMatchmakingRoomMock.mockImplementation(() => {
			throw new Error("room name collision");
		});

		provision.handle(makeMatch({ id: "match-5", participants: [a, b] }));

		expect(pool.add).toHaveBeenCalledWith(a);
		expect(pool.add).toHaveBeenCalledWith(b);
		expect(a.channel.found).not.toHaveBeenCalled();
		expect(b.channel.found).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith(
			"matchmaking.provision_failed",
			expect.objectContaining({ matchId: "match-5" }),
		);
		const loggedContext = (logger.error as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
		expect(JSON.stringify(loggedContext)).not.toContain("Yugi");
	});

	it("rejects a socket participant with no captured PLAYER_INFO, re-queues the other, and leaves no partial room", () => {
		const missing = ParticipantMother.create({
			userId: "user-a",
			presence: "socket",
			channel: mock<ParticipantChannel>(),
			admission: undefined,
		});
		const other = makeSocketParticipant({ userId: "user-b" });

		provision.handle(makeMatch({ id: "match-6", participants: [missing, other] }));

		expect(createMatchmakingRoomMock).not.toHaveBeenCalled();
		expect(missing.channel.close).toHaveBeenCalledWith("missing_player_info");
		expect(pool.add).toHaveBeenCalledWith(other);
		expect(pool.add).not.toHaveBeenCalledWith(missing);
		expect(logger.warn).toHaveBeenCalledWith(
			"matchmaking.provision_failed",
			expect.objectContaining({ matchId: "match-6", reason: "missing_player_info" }),
		);
	});
});
