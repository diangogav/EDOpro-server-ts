/**
 * DisconnectHandler.run() — edopro pipeline, mid-duel disconnect.
 *
 * The "has left the duel" chat notice duplicated the PLAYER_CHANGE protocol
 * message the client already receives and was pruned. Only the DUELING
 * teardown mechanics (no room/room-list mutation on this path) remain.
 */

jest.mock("../../../web-socket-server/WebSocketSingleton", () => {
	const mockBroadcast = jest.fn();
	return {
		__esModule: true,
		default: {
			getInstance: () => ({ broadcast: mockBroadcast }),
		},
		mockBroadcast,
	};
});

jest.mock("@edopro/client/domain/Client");

import { Client } from "@edopro/client/domain/Client";
import { Room } from "@edopro/room/domain/Room";

import { DisconnectHandler } from "./DisconnectHandler";
import { RoomFinder } from "./RoomFinder";
import { DuelState } from "../domain/YgoRoom";

describe("DisconnectHandler — edopro mid-duel disconnect", () => {
	it("does NOT broadcast a 'has left the duel' chat notice to the surviving player", () => {
		const leaverSocket = { id: "sock-leaver" };
		const leaver = new Client({} as never) as jest.Mocked<Client>;
		Object.assign(leaver, { socket: leaverSocket, name: "P1", sendMessage: jest.fn() });

		const survivor = new Client({} as never) as jest.Mocked<Client>;
		Object.assign(survivor, { socket: {}, sendMessage: jest.fn() });

		const room = {
			hasNoConnectedPlayers: false,
			duelState: DuelState.DUELING,
			players: [leaver, survivor],
			spectators: [],
		} as unknown as jest.Mocked<Room>;
		Object.setPrototypeOf(room, Room.prototype);

		const roomFinder = { run: jest.fn().mockReturnValue(room) } as unknown as RoomFinder;

		const handler = new DisconnectHandler(leaverSocket as never, roomFinder);
		handler.run("127.0.0.1");

		expect(survivor.sendMessage).not.toHaveBeenCalled();
		expect(leaver.sendMessage).not.toHaveBeenCalled();
	});
});
