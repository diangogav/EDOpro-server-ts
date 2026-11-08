import { EventEmitter } from "stream";

import { Commands } from "@shared/messages/Commands";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { MessageEmitter } from "@shared/messages/MessageEmitter";

function buildFrame(command: number, body: Buffer = Buffer.alloc(0)): Buffer {
	const size = Buffer.alloc(2);
	size.writeUInt16LE(body.length + 1);
	return Buffer.concat([size, Buffer.from([command]), body]);
}

describe("MessageEmitter", () => {
	let eventEmitter: EventEmitter;
	let createGameListener: jest.Mock;
	let joinGameListener: jest.Mock;
	let messageEmitter: MessageEmitter;

	beforeEach(() => {
		eventEmitter = new EventEmitter();
		createGameListener = jest.fn();
		joinGameListener = jest.fn();
		messageEmitter = new MessageEmitter(
			new LoggerMock(),
			eventEmitter,
			createGameListener,
			joinGameListener,
		);
	});

	describe.each([
		["MATCHMAKING_AUTH", Commands.MATCHMAKING_AUTH],
		["MATCHMAKING_ENTER", Commands.MATCHMAKING_ENTER],
		["MATCHMAKING_CANCEL", Commands.MATCHMAKING_CANCEL],
		["MATCHMAKING_ACCEPT", Commands.MATCHMAKING_ACCEPT],
		["MATCHMAKING_DECLINE", Commands.MATCHMAKING_DECLINE],
	])("%s", (_name, command) => {
		it("emits once on the connection event emitter", () => {
			const listener = jest.fn();
			eventEmitter.on(command as unknown as string, listener);

			messageEmitter.handleMessage(buildFrame(command));

			expect(listener).toHaveBeenCalledTimes(1);
		});
	});

	it("ignores an unknown opcode without emitting or throwing", () => {
		const emitSpy = jest.spyOn(eventEmitter, "emit");

		expect(() => messageEmitter.handleMessage(buildFrame(0xf0))).not.toThrow();

		expect(emitSpy).not.toHaveBeenCalled();
	});

	it("keeps PLAYER_INFO emitting unchanged", () => {
		const listener = jest.fn();
		eventEmitter.on(Commands.PLAYER_INFO as unknown as string, listener);

		messageEmitter.handleMessage(buildFrame(Commands.PLAYER_INFO, Buffer.from([1, 2, 3])));

		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("keeps CREATE_GAME triggering the game creator listener and emitting", () => {
		const listener = jest.fn();
		eventEmitter.on(Commands.CREATE_GAME as unknown as string, listener);

		messageEmitter.handleMessage(buildFrame(Commands.CREATE_GAME));

		expect(createGameListener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("keeps JOIN_GAME triggering the join listener and emitting", () => {
		const listener = jest.fn();
		eventEmitter.on(Commands.JOIN_GAME as unknown as string, listener);

		messageEmitter.handleMessage(buildFrame(Commands.JOIN_GAME));

		expect(joinGameListener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("keeps RECONNECT emitting unchanged", () => {
		const listener = jest.fn();
		eventEmitter.on(Commands.RECONNECT as unknown as string, listener);

		messageEmitter.handleMessage(buildFrame(Commands.RECONNECT));

		expect(listener).toHaveBeenCalledTimes(1);
	});

	describe("work per chunk", () => {
		it("dispatches every frame of a chunk with many frames without overflowing the stack", () => {
			const listener = jest.fn();
			eventEmitter.on(Commands.PLAYER_INFO as unknown as string, listener);
			const frames = 20_000;

			messageEmitter.handleMessage(
				Buffer.concat(Array.from({ length: frames }, () => buildFrame(Commands.PLAYER_INFO))),
			);

			expect(listener).toHaveBeenCalledTimes(frames);
		});

		it("does not dump the remaining buffer to the log for each frame", () => {
			const logger = new LoggerMock();
			const debug = jest.spyOn(logger, "debug");
			const emitter = new MessageEmitter(
				logger,
				eventEmitter,
				createGameListener,
				joinGameListener,
			);
			const chunk = Buffer.concat(
				Array.from({ length: 50 }, () => buildFrame(0x7f, Buffer.from([0xab]))),
			);

			emitter.handleMessage(chunk);

			const logged = debug.mock.calls.map(([message]) => String(message)).join("\n");
			expect(logged).not.toContain(chunk.subarray(4, 20).toString("hex"));
		});
	});
});
