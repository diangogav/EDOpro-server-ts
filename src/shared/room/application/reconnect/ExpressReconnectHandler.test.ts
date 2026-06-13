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
		({ data: Buffer.from(token, "utf8") } as ClientMessage);

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
