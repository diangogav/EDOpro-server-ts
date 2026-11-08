jest.mock("src/web-socket-server/WebSocketSingleton", () => ({
	__esModule: true,
	default: { getInstance: () => ({ broadcast: jest.fn() }) },
}));

import RoomList from "@edopro/room/infrastructure/RoomList";
import { Commands } from "@shared/messages/Commands";
import { ISocket } from "@shared/socket/domain/ISocket";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { createRoomFinder } from "src/bootstrap/roomFinder";
import { config } from "src/config";

import { SocketConnectionHandler } from "./SocketConnectionHandler";

const frame = (command: number, body: Buffer): Buffer => {
	const size = Buffer.alloc(2);
	size.writeUInt16LE(body.length + 1);
	return Buffer.concat([size, Buffer.from([command]), body]);
};

const playerInfoFrame = (name: string): Buffer => {
	const body = Buffer.alloc(40);
	body.write(name, 0, "utf16le");
	return frame(Commands.PLAYER_INFO, body);
};

const createGameFrame = (): Buffer => {
	const body = Buffer.alloc(349);
	body.writeUInt16LE(8000, 12);
	body.writeInt8(5, 16);
	body.writeInt8(1, 17);
	body.writeUInt16LE(180, 18);
	body.writeInt32LE(1, 32);
	body.writeInt32LE(1, 36);
	body.writeInt32LE(1, 40);
	return frame(Commands.CREATE_GAME, body);
};

const makeSocket = () => {
	let connectionListener: ((data: Buffer) => void) | null = null;
	let closeListener: () => void = () => undefined;
	const socket = {
		roomId: undefined as number | undefined,
		remoteAddress: "127.0.0.1",
		closed: false,
		send: jest.fn(),
		onMessage: (listener: (data: Buffer) => void) => {
			connectionListener ??= listener;
		},
		onClose: (listener: () => void) => {
			closeListener = listener;
		},
		destroy: jest.fn(),
		close: jest.fn(),
	};

	return {
		socket: socket as unknown as ISocket,
		deliver: (data: Buffer) => connectionListener?.(data),
		close: () => {
			socket.closed = true;
			closeListener();
		},
	};
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const roomsHostedBy = (socket: ISocket) =>
	RoomList.getRooms().filter((room) => room.players.some((player) => player.socket === socket));

describe("SocketConnectionHandler", () => {
	const rankingEnabled = config.ranking.enabled;

	beforeEach(() => {
		config.ranking.enabled = false;
	});

	afterEach(() => {
		config.ranking.enabled = rankingEnabled;
		[...RoomList.getRooms()].forEach((room) => RoomList.deleteRoom(room));
	});

	const connect = () => {
		const handler = new SocketConnectionHandler(
			new LoggerMock(),
			createRoomFinder(),
			{} as never,
			{} as never,
		);
		const connection = makeSocket();
		handler.handle(connection.socket);
		return connection;
	};

	it("creates one room when a connection sends several CREATE_GAME frames", async () => {
		const { socket, deliver } = connect();

		deliver(
			Buffer.concat([
				playerInfoFrame("host"),
				createGameFrame(),
				createGameFrame(),
				createGameFrame(),
			]),
		);
		await settle();

		expect(RoomList.getRooms()).toHaveLength(1);
		expect(roomsHostedBy(socket)).toHaveLength(1);
	});

	it("leaves no room behind after the host disconnects", async () => {
		const { deliver, close } = connect();
		deliver(Buffer.concat([playerInfoFrame("host"), createGameFrame(), createGameFrame()]));
		await settle();

		close();
		await settle();

		expect(RoomList.getRooms()).toHaveLength(0);
	});

	it("lets separate connections create their own rooms", async () => {
		const first = connect();
		const second = connect();

		first.deliver(Buffer.concat([playerInfoFrame("first"), createGameFrame()]));
		second.deliver(Buffer.concat([playerInfoFrame("second"), createGameFrame()]));
		await settle();

		expect(RoomList.getRooms()).toHaveLength(2);
		expect(new Set(RoomList.getRooms().map((room) => room.id)).size).toBe(2);
	});
});
