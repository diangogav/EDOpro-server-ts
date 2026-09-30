import WebSocket from "ws";

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
