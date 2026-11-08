jest.mock("src/web-socket-server/WebSocketSingleton", () => ({
	__esModule: true,
	default: { getInstance: () => ({ broadcast: jest.fn() }) },
}));
jest.mock("@ygopro/room/application/createYGOProRoomDeps", () => {
	const { AdmitToRoom } = jest.requireActual("@ygopro/room/admission/application/AdmitToRoom");
	const { RoomAdmission } = jest.requireActual("@shared/room/admission/domain/RoomAdmission");
	const { FinalizeYGOProRoom } = jest.requireActual("@ygopro/room/application/FinalizeYGOProRoom");
	const resolver = {
		resolve: async (_socket: unknown, playerInfo: { name: string }) => ({
			kind: "guest",
			name: playerInfo.name,
		}),
	};

	return {
		createYGOProRoomDeps: () => ({
			createCardRepository: () => ({}),
			createDeckBuilder: () => ({ build: async () => ({}) }),
			createPlayerAdmission: (logger: unknown) =>
				new AdmitToRoom(resolver, new RoomAdmission(), logger),
			createCredentialResolver: () => resolver,
			abandonment: { resolve: async () => undefined },
			finalizer: FinalizeYGOProRoom,
		}),
	};
});

import { Commands } from "@shared/messages/Commands";
import { ISocket } from "@shared/socket/domain/ISocket";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import { createRoomFinder } from "src/bootstrap/roomFinder";

import { YGOProConnectionHandler } from "./YGOProConnectionHandler";

const frame = (command: number, body: Buffer): Buffer => {
	const size = Buffer.alloc(2);
	size.writeUInt16LE(body.length + 1);
	return Buffer.concat([size, Buffer.from([command]), body]);
};

const playerInfo = (name: string): Buffer => {
	const body = Buffer.alloc(40);
	Buffer.from(name, "utf16le").copy(body);
	return frame(Commands.PLAYER_INFO, body);
};

const join = (pass: string): Buffer => {
	const body = Buffer.alloc(48);
	body.writeUInt16LE(0x1362, 0);
	Buffer.from(pass, "utf16le").copy(body, 8);
	return frame(Commands.JOIN_GAME, body);
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const connect = () => {
	let deliver!: (data: Buffer) => Promise<void>;
	let close!: () => void;
	const socket = {
		remoteAddress: undefined,
		closed: false,
		transport: "tcp",
		lastInboundAt: 0,
		send: jest.fn(),
		onMessage: (listener: (data: Buffer) => Promise<void>) => {
			deliver = listener;
		},
		onClose: (listener: () => void) => {
			close = listener;
		},
		close: jest.fn(),
		destroy: jest.fn(),
		closeGracefully: jest.fn(),
		closeSuperseded: jest.fn(),
		removeAllListeners: jest.fn(),
	};
	new YGOProConnectionHandler(new LoggerMock(), createRoomFinder()).handle(
		socket as unknown as ISocket,
	);

	return {
		deliver: (data: Buffer) => deliver(data),
		close: () => {
			socket.closed = true;
			close();
		},
	};
};

describe("YGOProConnectionHandler — rooms per connection", () => {
	afterEach(() => {
		[...YGOProRoomList.getRooms()].forEach((room) => YGOProRoomList.deleteRoom(room));
	});

	it("creates one room when a connection sends JOINs for two different rooms", async () => {
		const connection = connect();

		await connection.deliver(Buffer.concat([playerInfo("Alice"), join("RoomA")]));
		await settle();
		await connection.deliver(Buffer.concat([playerInfo("Alice"), join("RoomB")]));
		await settle();

		expect(YGOProRoomList.getRooms().map((room) => room.name)).toEqual(["RoomA"]);
	});

	it("leaves no room behind after that connection closes", async () => {
		const connection = connect();
		await connection.deliver(Buffer.concat([playerInfo("Alice"), join("RoomA")]));
		await settle();
		await connection.deliver(Buffer.concat([playerInfo("Alice"), join("RoomB")]));
		await settle();

		connection.close();
		await settle();

		expect(YGOProRoomList.getRooms().filter((room) => !room.finalizing)).toEqual([]);
	});
});
