import { EventEmitter } from "stream";

import { MatchAbandonClientMessage } from "@shared/messages/server-to-client/MatchAbandonClientMessage";
import { DuelState } from "@shared/room/domain/YgoRoom";
import { Team } from "@shared/room/Team";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";

import { YGOProRoom } from "./YGOProRoom";

// A reconnect between duels closes the abandon notice the opponent was shown.
describe("YGOProRoom.reconnect — abandon notice", () => {
	const makeClient = (team: number, position: number) => {
		const client = Object.create(YGOProClient.prototype) as YGOProClient;
		let socket = { removeAllListeners: jest.fn() };
		Object.defineProperty(client, "socket", { get: () => socket, configurable: true });
		Object.defineProperty(client, "team", { get: () => team, configurable: true });
		Object.defineProperty(client, "position", { get: () => position, configurable: true });
		Object.defineProperty(client, "name", { get: () => `p${position}`, configurable: true });
		Object.defineProperty(client, "host", { get: () => false, configurable: true });
		Object.assign(client, {
			setSocket: jest.fn((next) => (socket = next)),
			reconnecting: jest.fn(),
			sendMessageToClient: jest.fn(),
		});

		return client as jest.Mocked<YGOProClient>;
	};

	const makeRoom = (state: DuelState, players: YGOProClient[]) => {
		const logger = { child: jest.fn().mockReturnThis(), info: jest.fn(), debug: jest.fn() };
		const room = YGOProRoom.create(
			1,
			"ROOM",
			logger as never,
			new EventEmitter(),
			{ name: "p0", password: "", previousMessage: Buffer.alloc(0) } as never,
			"sock",
			{
				joinGameMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
				typeChangeMessageFromType: jest.fn().mockReturnValue(Buffer.alloc(0)),
				playerEnterMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
			} as never,
		);
		(room as unknown as { _state: DuelState })._state = state;
		(room as unknown as { _players: YGOProClient[] })._players = players;

		return room;
	};

	it.each([
		DuelState.RPS,
		DuelState.CHOOSING_ORDER,
		DuelState.SIDE_DECKING,
	])("tells the opponent the player is back during %s", (state) => {
		const returning = makeClient(Team.PLAYER, 0);
		const waiting = makeClient(Team.OPPONENT, 1);
		const room = makeRoom(state, [returning, waiting]);

		room.reconnect(returning, { removeAllListeners: jest.fn() } as never);

		expect(waiting.sendMessageToClient).toHaveBeenCalledWith(
			MatchAbandonClientMessage.opponentReconnected(),
		);
	});

	it("stays silent for a mid-duel reconnect", () => {
		const returning = makeClient(Team.PLAYER, 0);
		const waiting = makeClient(Team.OPPONENT, 1);
		const room = makeRoom(DuelState.DUELING, [returning, waiting]);

		room.reconnect(returning, { removeAllListeners: jest.fn() } as never);

		expect(waiting.sendMessageToClient).not.toHaveBeenCalled();
	});
});
