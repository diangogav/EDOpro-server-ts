import { mock, MockProxy } from "jest-mock-extended";

import { Commands } from "@shared/messages/Commands";
import { Logger } from "@shared/logger/domain/Logger";
import { RoomFinder } from "@shared/room/application/RoomFinder";
import { ISocket } from "@shared/socket/domain/ISocket";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { YGOProConnectionHandler } from "./YGOProConnectionHandler";

jest.mock("src/config", () => ({ config: { servers: { mercury: { port: 7700 } } } }));
jest.mock("@ygopro/room/application/YGOProGameCreatorHandler");
jest.mock("@ygopro/room/application/YGOProJoinHandler");
jest.mock("@ygopro/room/infrastructure/YGOProMessageRepository");
jest.mock("@shared/room/application/DisconnectHandler");

const makeSocket = (): MockProxy<ISocket> =>
	mock<ISocket>({ remoteAddress: "127.0.0.1", closed: false });

const buildFrame = (command: number, body: Buffer = Buffer.alloc(0)): Buffer => {
	const size = Buffer.alloc(2);
	size.writeUInt16LE(body.length + 1);
	return Buffer.concat([size, Buffer.from([command]), body]);
};

const registerPump = (socket: MockProxy<ISocket>): ((data: Buffer) => Promise<void> | void) => {
	let callback!: (data: Buffer) => Promise<void> | void;
	socket.onMessage.mockImplementation((cb) => {
		callback = cb;
	});
	return (data) => callback(data);
};

describe("YGOProConnectionHandler", () => {
	let logger: Logger;
	let roomFinder: MockProxy<RoomFinder>;

	beforeEach(() => {
		logger = new LoggerMock();
		roomFinder = mock<RoomFinder>();
	});

	describe("TCP responds to PING", () => {
		it("echoes a PING as PONG at offset 2, preserving the payload, on a connection with no auth gate", async () => {
			const socket = makeSocket();
			const pump = registerPump(socket);
			new YGOProConnectionHandler(logger, roomFinder).handle(socket);

			const ping = buildFrame(Commands.PING, Buffer.from([0xde, 0xad, 0xbe]));
			await pump(ping);

			expect(socket.send).toHaveBeenCalledTimes(1);
			const sent = socket.send.mock.calls[0][0] as Buffer;
			expect(sent.readUInt8(2)).toBe(Commands.PONG);
			expect(sent.subarray(3)).toEqual(ping.subarray(3));
		});

		it("echoes a PING as PONG once a gated connection's authenticate option resolves", async () => {
			let resolveAuth!: (proceed: boolean) => void;
			const authenticate = jest.fn(
				() => new Promise<boolean>((resolve) => (resolveAuth = resolve)),
			);
			const socket = makeSocket();
			const pump = registerPump(socket);
			new YGOProConnectionHandler(logger, roomFinder).handle(socket, { authenticate });

			const ping = buildFrame(Commands.PING, Buffer.from([0x01, 0x02, 0x03]));
			const pumped = pump(ping);
			expect(socket.send).not.toHaveBeenCalled();

			resolveAuth(true);
			await pumped;

			expect(socket.send).toHaveBeenCalledTimes(1);
			const sent = socket.send.mock.calls[0][0] as Buffer;
			expect(sent.readUInt8(2)).toBe(Commands.PONG);
			expect(sent.subarray(3)).toEqual(ping.subarray(3));
		});
	});

	describe("ready gate", () => {
		it("resolves immediately when no authenticate option is given, so a non-ping frame is pumped without waiting", async () => {
			const socket = makeSocket();
			const pump = registerPump(socket);
			new YGOProConnectionHandler(logger, roomFinder).handle(socket);

			const chat = buildFrame(Commands.CHAT);
			await pump(chat);

			expect(socket.send).not.toHaveBeenCalled();
		});
	});

	describe("express reconnect wiring", () => {
		it("routes an express-reconnect frame to a failure ack when the token is unknown, on both transports", async () => {
			const socket = makeSocket();
			const pump = registerPump(socket);
			new YGOProConnectionHandler(logger, roomFinder).handle(socket);

			const reconnect = buildFrame(Commands.RECONNECT, Buffer.from("unknown-token", "utf8"));
			await pump(reconnect);

			expect(socket.send).toHaveBeenCalledTimes(1);
			const sent = socket.send.mock.calls[0][0] as Buffer;
			expect(sent.readUInt8(2)).toBe(Commands.RECONNECT);
			expect(sent.readUInt8(3)).toBe(0x01);
			expect(socket.destroy).toHaveBeenCalledTimes(1);
		});
	});
});
