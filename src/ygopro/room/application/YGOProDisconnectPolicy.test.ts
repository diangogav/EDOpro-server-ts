jest.mock("@ygopro/matchmaking/application/AbortMatchmakingRoom", () => ({
	AbortMatchmakingRoom: { run: jest.fn() },
}));

jest.mock("@ygopro/room/application/FinalizeYGOProRoom", () => ({
	FinalizeYGOProRoom: { run: jest.fn() },
}));

jest.mock("@ygopro/room/application/AbandonBetweenDuels", () => ({
	AbandonBetweenDuels: { playerLeft: jest.fn().mockReturnValue(false) },
}));

jest.mock("@ygopro/client/domain/YGOProClient");

import { DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { AbortMatchmakingRoom } from "@ygopro/matchmaking/application/AbortMatchmakingRoom";
import { AbandonBetweenDuels } from "@ygopro/room/application/AbandonBetweenDuels";
import { FinalizeYGOProRoom } from "@ygopro/room/application/FinalizeYGOProRoom";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { YGOProDisconnectPolicy } from "./YGOProDisconnectPolicy";

function makeClient(socketId: string): jest.Mocked<YGOProClient> {
	const client = new YGOProClient({} as never) as jest.Mocked<YGOProClient>;
	Object.assign(client, { socket: { id: socketId }, destroy: jest.fn() });

	return client;
}

function makeRoom(options: {
	players?: YGOProClient[];
	spectators?: YGOProClient[];
	duelState?: DuelState;
	isMatchmaking?: boolean;
	hasNoConnectedPlayers?: boolean;
	noHost?: boolean;
}): jest.Mocked<YGOProRoom> {
	const room = {
		players: options.players ?? [],
		spectators: options.spectators ?? [],
		duelState: options.duelState ?? DuelState.WAITING,
		isMatchmaking: options.isMatchmaking ?? false,
		hasNoConnectedPlayers: options.hasNoConnectedPlayers ?? false,
		noHost: options.noHost ?? false,
		playerLeave: jest.fn(),
		spectatorLeave: jest.fn(),
	};
	Object.setPrototypeOf(room, YGOProRoom.prototype);

	return room as unknown as jest.Mocked<YGOProRoom>;
}

function socketOf(client: YGOProClient): ISocket {
	return client.socket as unknown as ISocket;
}

describe("YGOProDisconnectPolicy", () => {
	const policy = new YGOProDisconnectPolicy();
	const logger = new LoggerMock();
	const abandon = AbandonBetweenDuels.playerLeft as jest.Mock;

	afterEach(() => {
		jest.clearAllMocks();
		abandon.mockReturnValue(false);
	});

	it("handles YGOPro rooms only", () => {
		expect(policy.handles(makeRoom({}))).toBe(true);
		expect(policy.handles({} as YgoRoom)).toBe(false);
	});

	it("aborts a matchmaking lobby while waiting, before any other check", () => {
		const leaver = makeClient("sock-leaver");
		const room = makeRoom({ players: [leaver], isMatchmaking: true, hasNoConnectedPlayers: true });

		policy.onDisconnect(room, socketOf(leaver), logger);

		expect(AbortMatchmakingRoom.run).toHaveBeenCalledWith(room);
		expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
		expect(room.playerLeave).not.toHaveBeenCalled();
	});

	it("does not abort a matchmaking room once the duel has started", () => {
		const leaver = makeClient("sock-leaver");
		const room = makeRoom({
			players: [leaver],
			isMatchmaking: true,
			duelState: DuelState.DUELING,
			hasNoConnectedPlayers: true,
		});

		policy.onDisconnect(room, socketOf(leaver), logger);

		expect(AbortMatchmakingRoom.run).not.toHaveBeenCalled();
		expect(FinalizeYGOProRoom.run).toHaveBeenCalledWith(room);
	});

	it("finalizes a room with no connected players", () => {
		const leaver = makeClient("sock-leaver");
		const room = makeRoom({ players: [leaver], hasNoConnectedPlayers: true });

		policy.onDisconnect(room, socketOf(leaver), logger);

		expect(FinalizeYGOProRoom.run).toHaveBeenCalledWith(room);
		expect(abandon).not.toHaveBeenCalled();
		expect(room.playerLeave).not.toHaveBeenCalled();
	});

	it("removes a leaving spectator and destroys its client", () => {
		const player = makeClient("sock-player");
		const spectator = makeClient("sock-spectator");
		const room = makeRoom({ players: [player], spectators: [spectator] });

		policy.onDisconnect(room, socketOf(spectator), logger);

		expect(room.spectatorLeave).toHaveBeenCalledWith(spectator);
		expect(spectator.destroy).toHaveBeenCalled();
		expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
		expect(room.playerLeave).not.toHaveBeenCalled();
	});

	it("finalizes an AI room when its human leaves, before the between-duels grace", () => {
		const human = makeClient("sock-human");
		const room = makeRoom({ players: [human], noHost: true, duelState: DuelState.SIDE_DECKING });

		policy.onDisconnect(room, socketOf(human), logger);

		expect(FinalizeYGOProRoom.run).toHaveBeenCalledWith(room);
		expect(abandon).not.toHaveBeenCalled();
	});

	it("stops after the between-duels grace takes the player", () => {
		const leaver = makeClient("sock-leaver");
		const room = makeRoom({ players: [leaver, makeClient("sock-other")] });
		abandon.mockReturnValue(true);

		policy.onDisconnect(room, socketOf(leaver), logger);

		expect(abandon).toHaveBeenCalledWith(room, leaver, logger);
		expect(room.playerLeave).not.toHaveBeenCalled();
		expect(leaver.destroy).not.toHaveBeenCalled();
	});

	it("removes a player who leaves while waiting and destroys its client", () => {
		const leaver = makeClient("sock-leaver");
		const room = makeRoom({ players: [leaver, makeClient("sock-other")] });

		policy.onDisconnect(room, socketOf(leaver), logger);

		expect(room.playerLeave).toHaveBeenCalledWith(leaver);
		expect(leaver.destroy).toHaveBeenCalled();
		expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
	});

	it("leaves a player in the room when they drop mid-duel outside the grace", () => {
		const leaver = makeClient("sock-leaver");
		const room = makeRoom({
			players: [leaver, makeClient("sock-other")],
			duelState: DuelState.DUELING,
		});

		policy.onDisconnect(room, socketOf(leaver), logger);

		expect(room.playerLeave).not.toHaveBeenCalled();
		expect(leaver.destroy).not.toHaveBeenCalled();
		expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
	});

	it("ignores a socket that is neither a player nor a spectator", () => {
		const room = makeRoom({ players: [makeClient("sock-player")] });

		policy.onDisconnect(room, { id: "sock-unknown" } as ISocket, logger);

		expect(room.playerLeave).not.toHaveBeenCalled();
		expect(room.spectatorLeave).not.toHaveBeenCalled();
		expect(FinalizeYGOProRoom.run).not.toHaveBeenCalled();
	});
});
