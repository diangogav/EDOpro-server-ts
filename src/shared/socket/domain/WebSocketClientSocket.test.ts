import { EventEmitter } from "events";
import WebSocket from "ws";

import { SUPERSEDED_CLOSE_TIMEOUT_MS } from "./sessionSuperseded";
import { WebSocketClientSocket } from "./WebSocketClientSocket";

jest.mock("ws");

const makeRawSocket = (): WebSocket =>
	({
		on: jest.fn(),
		once: jest.fn(),
		off: jest.fn(),
		send: jest.fn(),
		close: jest.fn(),
		terminate: jest.fn(),
		readyState: WebSocket.OPEN,
	}) as unknown as WebSocket;

describe("WebSocketClientSocket", () => {
	describe("resolvedUserId", () => {
		it("is undefined by default", () => {
			const socket = new WebSocketClientSocket(makeRawSocket());
			expect(socket.resolvedUserId).toBeUndefined();
		});

		it("can be set after construction", () => {
			const socket = new WebSocketClientSocket(makeRawSocket());
			socket.resolvedUserId = "user-123";
			expect(socket.resolvedUserId).toBe("user-123");
		});
	});

	describe("closeGracefully", () => {
		beforeEach(() => jest.useFakeTimers());
		afterEach(() => jest.useRealTimers());

		const closeHandlerOf = (raw: WebSocket): (() => void) => {
			const call = (raw.once as jest.Mock).mock.calls.find(([event]) => event === "close");
			return call?.[1] as () => void;
		};

		it("sends a normal close frame instead of terminating", () => {
			const raw = makeRawSocket();
			new WebSocketClientSocket(raw).closeGracefully(1000);

			expect(raw.close).toHaveBeenCalledWith(1000);
			expect(raw.terminate).not.toHaveBeenCalled();
		});

		it("detaches the message and close listeners so no disconnect handling fires", () => {
			const raw = makeRawSocket();
			const socket = new WebSocketClientSocket(raw);
			socket.onMessage(jest.fn());
			socket.onClose(jest.fn());

			socket.closeGracefully(1000);

			expect(raw.off).toHaveBeenCalledWith("message", expect.any(Function));
			expect(raw.off).toHaveBeenCalledWith("close", expect.any(Function));
		});

		it("reports the socket as closed while the close handshake is pending", () => {
			const raw = makeRawSocket();
			const socket = new WebSocketClientSocket(raw);

			socket.closeGracefully(1000);

			expect(socket.closed).toBe(true);
		});

		it("terminates only after the timeout when the peer never closes", () => {
			const raw = makeRawSocket();
			new WebSocketClientSocket(raw).closeGracefully(1000);

			jest.advanceTimersByTime(999);
			expect(raw.terminate).not.toHaveBeenCalled();

			jest.advanceTimersByTime(1);
			expect(raw.terminate).toHaveBeenCalledTimes(1);
		});

		it("never terminates once the close event arrived", () => {
			const raw = makeRawSocket();
			new WebSocketClientSocket(raw).closeGracefully(1000);

			closeHandlerOf(raw)();
			jest.advanceTimersByTime(5000);

			expect(raw.terminate).not.toHaveBeenCalled();
		});

		it("does not keep the process alive for the fallback timer", () => {
			const unref = jest.fn();
			const setTimeoutSpy = jest
				.spyOn(global, "setTimeout")
				.mockReturnValue({ unref } as unknown as NodeJS.Timeout);

			new WebSocketClientSocket(makeRawSocket()).closeGracefully(1000);

			expect(unref).toHaveBeenCalled();
			setTimeoutSpy.mockRestore();
		});
	});

	describe("destroy", () => {
		it("still hard-terminates", () => {
			const raw = makeRawSocket();
			new WebSocketClientSocket(raw).destroy();

			expect(raw.terminate).toHaveBeenCalled();
			expect(raw.close).not.toHaveBeenCalled();
		});
	});
});

describe("WebSocketClientSocket.closeSuperseded", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	const makeEmitterSocket = () => {
		const raw = new EventEmitter() as EventEmitter & {
			readyState: number;
			close: jest.Mock;
			terminate: jest.Mock;
			send: jest.Mock;
		};
		raw.readyState = WebSocket.OPEN;
		raw.send = jest.fn();
		raw.close = jest.fn((_code?: number, _reason?: string) => {
			raw.readyState = WebSocket.CLOSING;
		});
		raw.terminate = jest.fn();
		return raw;
	};

	it("closes with code 4001 and reason 'session superseded'", () => {
		const raw = makeEmitterSocket();

		new WebSocketClientSocket(raw as unknown as WebSocket).closeSuperseded();

		expect(raw.close).toHaveBeenCalledWith(4001, "session superseded");
		expect(raw.terminate).not.toHaveBeenCalled();
	});

	it("does not run disconnect handling when the old socket finally closes", () => {
		const raw = makeEmitterSocket();
		const socket = new WebSocketClientSocket(raw as unknown as WebSocket);
		const onClose = jest.fn();
		const onMessage = jest.fn();
		socket.onClose(onClose);
		socket.onMessage(onMessage);

		socket.closeSuperseded();
		raw.emit("close");
		raw.emit("message", Buffer.from([1]));

		expect(onClose).not.toHaveBeenCalled();
		expect(onMessage).not.toHaveBeenCalled();
	});

	it("reports closed immediately", () => {
		const raw = makeEmitterSocket();
		const socket = new WebSocketClientSocket(raw as unknown as WebSocket);

		socket.closeSuperseded();

		expect(socket.closed).toBe(true);
	});

	it("terminates only after the bounded fallback when the peer never completes the close", () => {
		const raw = makeEmitterSocket();
		new WebSocketClientSocket(raw as unknown as WebSocket).closeSuperseded();

		jest.advanceTimersByTime(SUPERSEDED_CLOSE_TIMEOUT_MS - 1);
		expect(raw.terminate).not.toHaveBeenCalled();

		jest.advanceTimersByTime(1);
		expect(raw.terminate).toHaveBeenCalledTimes(1);
	});

	it("never terminates once the close event arrived", () => {
		const raw = makeEmitterSocket();
		new WebSocketClientSocket(raw as unknown as WebSocket).closeSuperseded();

		raw.emit("close");
		jest.advanceTimersByTime(SUPERSEDED_CLOSE_TIMEOUT_MS * 2);

		expect(raw.terminate).not.toHaveBeenCalled();
	});
});

describe("WebSocketClientSocket lastInboundAt", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(10_000);
	});
	afterEach(() => jest.useRealTimers());

	const makeEmitterSocket = () => new EventEmitter() as unknown as WebSocket;

	it("starts at the moment of connection", () => {
		expect(new WebSocketClientSocket(makeEmitterSocket()).lastInboundAt).toBe(10_000);
	});

	it("moves forward on every inbound message", () => {
		const raw = makeEmitterSocket();
		const socket = new WebSocketClientSocket(raw);

		jest.setSystemTime(25_000);
		raw.emit("message", Buffer.from([1]));

		expect(socket.lastInboundAt).toBe(25_000);
	});

	it("moves forward on a heartbeat pong, even with no message listener attached", () => {
		const raw = makeEmitterSocket();
		const socket = new WebSocketClientSocket(raw);

		jest.setSystemTime(40_000);
		raw.emit("pong");

		expect(socket.lastInboundAt).toBe(40_000);
	});
});
