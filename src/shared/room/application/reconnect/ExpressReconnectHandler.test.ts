import { EventEmitter } from "stream";

import { ExpressReconnectHandler } from "./ExpressReconnectHandler";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { YgoClient } from "@shared/client/domain/YgoClient";
import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";
import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";

const FAILURE_ACK = Buffer.from([0x02, 0x00, 0xfd, 0x01]);

describe("ExpressReconnectHandler (generic)", () => {
	let emitter: EventEmitter;
	let socket: jest.Mocked<ISocket>;
	let logger: jest.Mocked<Logger>;
	let room: jest.Mocked<YgoRoom>;
	let resolveRoom: jest.Mock;
	let clientGuard: jest.Mock;

	const client = { name: "Alice" } as unknown as YgoClient;
	const reconnectMessage = (token: string): ClientMessage =>
		({ data: Buffer.from(token, "utf8") }) as ClientMessage;

	const emitReconnect = (message: ClientMessage) =>
		emitter.emit(Commands.RECONNECT as unknown as string, message);

	beforeEach(() => {
		TokenIndex.getInstance().clear();
		emitter = new EventEmitter();
		socket = {
			send: jest.fn(),
			destroy: jest.fn(),
		} as unknown as jest.Mocked<ISocket>;
		logger = { info: jest.fn() } as unknown as jest.Mocked<Logger>;
		room = { id: 1, emit: jest.fn() } as unknown as jest.Mocked<YgoRoom>;
		resolveRoom = jest.fn((id: number) => (id === 1 ? room : undefined));
		clientGuard = jest.fn(() => true);

		new ExpressReconnectHandler(emitter, logger, socket, resolveRoom, clientGuard);
	});

	afterEach(() => TokenIndex.getInstance().clear());

	it("forwards a valid token to its room as EXPRESS_RECONNECT", () => {
		TokenIndex.getInstance().register("tok", client, 1);
		const message = reconnectMessage("tok");

		emitReconnect(message);

		expect(room.emit).toHaveBeenCalledWith("EXPRESS_RECONNECT", message, socket);
		expect(socket.send).not.toHaveBeenCalled();
		expect(socket.destroy).not.toHaveBeenCalled();
	});

	it("rejects an unknown token with a failure ack + destroy", () => {
		emitReconnect(reconnectMessage("ghost"));

		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
		expect(room.emit).not.toHaveBeenCalled();
	});

	it("never writes the full token to the logs", () => {
		const token = "0123456789abcdef0123456789abcdef";
		TokenIndex.getInstance().register(token, client, 1);

		emitReconnect(reconnectMessage(token));
		emitReconnect(reconnectMessage("fedcba9876543210fedcba9876543210"));

		const logged = logger.info.mock.calls.map((call) => String(call[0])).join("\n");
		expect(logged).not.toContain(token);
		expect(logged).not.toContain("fedcba9876543210fedcba9876543210");
		expect(logged).toContain("012345…");
	});

	describe("identity binding", () => {
		const verifiedClient = (userId: string) =>
			({ name: "Alice", credential: { kind: "verified", userId } }) as unknown as YgoClient;

		it("accepts a verified seat when the socket resolved the same account", () => {
			TokenIndex.getInstance().register("tok", verifiedClient("u1"), 1);
			socket.resolvedUserId = "u1";

			emitReconnect(reconnectMessage("tok"));

			expect(room.emit).toHaveBeenCalledWith("EXPRESS_RECONNECT", expect.anything(), socket);
			expect(socket.destroy).not.toHaveBeenCalled();
		});

		it("rejects a verified seat when the socket resolved a different account", () => {
			TokenIndex.getInstance().register("tok", verifiedClient("u1"), 1);
			socket.resolvedUserId = "u2";

			emitReconnect(reconnectMessage("tok"));

			expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
			expect(socket.destroy).toHaveBeenCalled();
			expect(room.emit).not.toHaveBeenCalled();
		});

		it("accepts a verified seat from a ticketless socket", () => {
			TokenIndex.getInstance().register("tok", verifiedClient("u1"), 1);

			emitReconnect(reconnectMessage("tok"));

			expect(room.emit).toHaveBeenCalled();
		});

		it("does not bind non-verified seats", () => {
			const guest = {
				name: "G",
				credential: { kind: "guest", name: "G" },
			} as unknown as YgoClient;
			TokenIndex.getInstance().register("tok", guest, 1);
			socket.resolvedUserId = "u2";

			emitReconnect(reconnectMessage("tok"));

			expect(room.emit).toHaveBeenCalled();
		});
	});

	it("rejects when the client-type guard fails", () => {
		clientGuard.mockReturnValue(false);
		TokenIndex.getInstance().register("tok", client, 1);

		emitReconnect(reconnectMessage("tok"));

		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
		expect(room.emit).not.toHaveBeenCalled();
	});

	it("rejects when the room cannot be resolved", () => {
		TokenIndex.getInstance().register("tok", client, 999);

		emitReconnect(reconnectMessage("tok"));

		expect(resolveRoom).toHaveBeenCalledWith(999);
		expect(socket.send).toHaveBeenCalledWith(FAILURE_ACK);
		expect(socket.destroy).toHaveBeenCalled();
		expect(room.emit).not.toHaveBeenCalled();
	});
});
