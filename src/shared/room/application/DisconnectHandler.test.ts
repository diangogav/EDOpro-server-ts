import { ISocket } from "@shared/socket/domain/ISocket";
import { SocketDisconnectListener } from "@shared/socket/domain/SocketDisconnectListener";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { RoomDisconnectPolicy } from "../domain/RoomDisconnectPolicy";
import { YgoRoom } from "../domain/YgoRoom";
import { DisconnectHandler } from "./DisconnectHandler";
import { RoomFinder } from "./RoomFinder";

const room = { id: 7 } as unknown as YgoRoom;

function makeFinder(found: YgoRoom | null, calls: string[]): RoomFinder {
	return {
		run: jest.fn(() => {
			calls.push("lookup");

			return found;
		}),
	} as unknown as RoomFinder;
}

function makePolicy(name: string, handles: boolean, calls: string[]): RoomDisconnectPolicy {
	return {
		handles: jest.fn(() => handles),
		onDisconnect: jest.fn(() => {
			calls.push(name);
		}),
	};
}

function makeListener(calls: string[]): SocketDisconnectListener {
	return {
		onSocketClosed: jest.fn(() => {
			calls.push("listener");
		}),
	};
}

describe("DisconnectHandler", () => {
	const socket = { id: "sock-1" } as ISocket;

	it("runs the listeners, then the room lookup, then the first policy that handles the room", () => {
		const calls: string[] = [];
		const skipped = makePolicy("skipped", false, calls);
		const chosen = makePolicy("chosen", true, calls);
		const later = makePolicy("later", true, calls);
		const listener = makeListener(calls);
		const logger = new LoggerMock();

		new DisconnectHandler(
			socket,
			makeFinder(room, calls),
			[skipped, chosen, later],
			[listener],
			logger,
		).run();

		expect(calls).toEqual(["listener", "lookup", "chosen"]);
		expect(listener.onSocketClosed).toHaveBeenCalledWith("sock-1", logger);
		expect(chosen.onDisconnect).toHaveBeenCalledWith(room, socket, logger);
		expect(later.handles).not.toHaveBeenCalled();
	});

	it("runs only the listeners when the socket has no room", () => {
		const calls: string[] = [];
		const policy = makePolicy("policy", true, calls);

		new DisconnectHandler(socket, makeFinder(null, calls), [policy], [makeListener(calls)]).run();

		expect(calls).toEqual(["listener", "lookup"]);
		expect(policy.handles).not.toHaveBeenCalled();
	});

	it("does nothing when the socket has no id", () => {
		const calls: string[] = [];

		new DisconnectHandler({} as ISocket, makeFinder(room, calls), [], [makeListener(calls)]).run();

		expect(calls).toEqual([]);
	});
});
