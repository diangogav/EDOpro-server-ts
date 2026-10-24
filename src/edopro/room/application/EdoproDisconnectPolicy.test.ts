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

jest.mock("@edopro/room/infrastructure/RoomList", () => ({
	__esModule: true,
	default: { deleteRoom: jest.fn() },
}));

jest.mock("@edopro/client/domain/Client");

import { Client } from "@edopro/client/domain/Client";
import { PlayerChangeClientMessage } from "@edopro/messages/server-to-client/PlayerChangeClientMessage";
import { WatchChangeClientMessage } from "@edopro/messages/server-to-client/WatchChangeClientMessage";
import { Room } from "@edopro/room/domain/Room";
import RoomList from "@edopro/room/infrastructure/RoomList";
import { DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";

import { EdoproDisconnectPolicy } from "./EdoproDisconnectPolicy";

const { mockBroadcast } = jest.requireMock("../../../web-socket-server/WebSocketSingleton") as {
	mockBroadcast: jest.Mock;
};

type FakeClient = jest.Mocked<Client> & { socket: { id: string; removeAllListeners: jest.Mock } };

function makeClient(
	socketId: string,
	overrides: { host?: boolean; position?: number } = {},
): FakeClient {
	const client = new Client({} as never) as FakeClient;
	Object.assign(client, {
		socket: { id: socketId, removeAllListeners: jest.fn() },
		host: overrides.host ?? false,
		position: overrides.position ?? 0,
		sendMessage: jest.fn(),
	});

	return client;
}

function makeRoom(options: {
	players: FakeClient[];
	spectators?: FakeClient[];
	duelState?: DuelState;
	hasNoConnectedPlayers?: () => boolean;
}): jest.Mocked<Room> {
	const spectators = options.spectators ?? [];
	const room = {
		duelState: options.duelState ?? DuelState.WAITING,
		players: options.players,
		spectators,
		removePlayer: jest.fn(),
		removeSpectator: jest.fn((spectator: FakeClient) => {
			spectators.splice(spectators.indexOf(spectator), 1);
		}),
		toRealTimePresentation: jest.fn(() => ({ id: 42 })),
	};
	Object.defineProperty(room, "hasNoConnectedPlayers", {
		get: options.hasNoConnectedPlayers ?? (() => false),
	});
	Object.setPrototypeOf(room, Room.prototype);

	return room as unknown as jest.Mocked<Room>;
}

function socketOf(client: FakeClient): ISocket {
	return client.socket as unknown as ISocket;
}

describe("EdoproDisconnectPolicy", () => {
	const policy = new EdoproDisconnectPolicy();

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("handles EDOPro rooms only", () => {
		expect(policy.handles(makeRoom({ players: [] }))).toBe(true);
		expect(policy.handles({} as YgoRoom)).toBe(false);
	});

	it("deletes a room with no connected players and broadcasts REMOVE-ROOM", () => {
		const leaver = makeClient("sock-leaver");
		const room = makeRoom({ players: [leaver], hasNoConnectedPlayers: () => true });

		policy.onDisconnect(room, socketOf(leaver));

		expect(RoomList.deleteRoom).toHaveBeenCalledWith(room);
		expect(mockBroadcast).toHaveBeenCalledWith({ action: "REMOVE-ROOM", data: { id: 42 } });
		expect(room.removePlayer).not.toHaveBeenCalled();
		expect(leaver.sendMessage).not.toHaveBeenCalled();
	});

	it("deletes the room when the host leaves while waiting", () => {
		const host = makeClient("sock-host", { host: true });
		const guest = makeClient("sock-guest", { position: 1 });
		const room = makeRoom({ players: [host, guest] });

		policy.onDisconnect(room, socketOf(host));

		expect(RoomList.deleteRoom).toHaveBeenCalledWith(room);
		expect(mockBroadcast).toHaveBeenCalledWith({ action: "REMOVE-ROOM", data: { id: 42 } });
		expect(room.removePlayer).not.toHaveBeenCalled();
		expect(guest.sendMessage).not.toHaveBeenCalled();
	});

	it("removes a guest who leaves while waiting and tells everyone their slot is free", () => {
		const host = makeClient("sock-host", { host: true });
		const guest = makeClient("sock-guest", { position: 1 });
		const spectator = makeClient("sock-spectator");
		const room = makeRoom({ players: [host, guest], spectators: [spectator] });

		policy.onDisconnect(room, socketOf(guest));

		const expected = PlayerChangeClientMessage.create({ status: (1 << 4) | 0xb });
		expect(room.removePlayer).toHaveBeenCalledWith(guest);
		expect(guest.socket.removeAllListeners).toHaveBeenCalled();
		expect(host.sendMessage).toHaveBeenCalledWith(expected);
		expect(spectator.sendMessage).toHaveBeenCalledWith(expected);
		expect(RoomList.deleteRoom).not.toHaveBeenCalled();
		expect(mockBroadcast).not.toHaveBeenCalled();
	});

	it("removes a leaving spectator and sends the new spectator count", () => {
		const host = makeClient("sock-host", { host: true });
		const leaving = makeClient("sock-leaving");
		const staying = makeClient("sock-staying");
		const room = makeRoom({ players: [host], spectators: [leaving, staying] });

		policy.onDisconnect(room, socketOf(leaving));

		const expected = WatchChangeClientMessage.create({ count: 1 });
		expect(room.removeSpectator).toHaveBeenCalledWith(leaving);
		expect(leaving.socket.removeAllListeners).toHaveBeenCalled();
		expect(host.sendMessage).toHaveBeenCalledWith(expected);
		expect(staying.sendMessage).toHaveBeenCalledWith(expected);
		expect(leaving.sendMessage).not.toHaveBeenCalled();
		expect(RoomList.deleteRoom).not.toHaveBeenCalled();
	});

	it("deletes the room when the last spectator of a room without connected players leaves", () => {
		const host = makeClient("sock-host", { host: true });
		const spectator = makeClient("sock-spectator");
		const connected = [true, false];
		const room = makeRoom({
			players: [host],
			spectators: [spectator],
			hasNoConnectedPlayers: () => !connected.shift(),
		});

		policy.onDisconnect(room, socketOf(spectator));

		expect(host.sendMessage).toHaveBeenCalledWith(WatchChangeClientMessage.create({ count: 0 }));
		expect(RoomList.deleteRoom).toHaveBeenCalledWith(room);
		expect(mockBroadcast).toHaveBeenCalledWith({ action: "REMOVE-ROOM", data: { id: 42 } });
	});

	it("ignores a socket that is neither a player nor a spectator", () => {
		const host = makeClient("sock-host", { host: true });
		const room = makeRoom({ players: [host] });

		policy.onDisconnect(room, { id: "sock-unknown" } as ISocket);

		expect(room.removePlayer).not.toHaveBeenCalled();
		expect(room.removeSpectator).not.toHaveBeenCalled();
		expect(host.sendMessage).not.toHaveBeenCalled();
		expect(RoomList.deleteRoom).not.toHaveBeenCalled();
	});
});
