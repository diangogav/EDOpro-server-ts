import { EventEmitter } from "events";
import { Socket } from "net";

import { SUPERSEDED_CLOSE_TIMEOUT_MS } from "./sessionSuperseded";
import { TCPClientSocket } from "./TCPClientSocket";
import { TCP_KEEPALIVE_INITIAL_DELAY_MS } from "./tcpKeepAlive";

const makeRawSocket = () => {
	const raw = new EventEmitter() as EventEmitter & {
		setKeepAlive: jest.Mock;
		end: jest.Mock;
		destroy: jest.Mock;
		write: jest.Mock;
		closed: boolean;
	};
	raw.setKeepAlive = jest.fn();
	raw.end = jest.fn();
	raw.destroy = jest.fn();
	raw.write = jest.fn();
	raw.closed = false;
	return raw;
};

describe("TCPClientSocket.closeGracefully", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("ends the socket instead of destroying it", () => {
		const raw = makeRawSocket();
		new TCPClientSocket(raw as unknown as Socket).closeGracefully(1000);

		expect(raw.end).toHaveBeenCalled();
		expect(raw.destroy).not.toHaveBeenCalled();
	});

	it("detaches the close listener so no disconnect handling fires", () => {
		const raw = makeRawSocket();
		const onClose = jest.fn();
		const socket = new TCPClientSocket(raw as unknown as Socket);
		socket.onClose(onClose);

		socket.closeGracefully(1000);
		raw.emit("close");

		expect(onClose).not.toHaveBeenCalled();
	});

	it("reports closed while the end is pending", () => {
		const raw = makeRawSocket();
		const socket = new TCPClientSocket(raw as unknown as Socket);

		socket.closeGracefully(1000);

		expect(socket.closed).toBe(true);
	});

	it("destroys only after the timeout when the peer never closes", () => {
		const raw = makeRawSocket();
		new TCPClientSocket(raw as unknown as Socket).closeGracefully(1000);

		jest.advanceTimersByTime(999);
		expect(raw.destroy).not.toHaveBeenCalled();

		jest.advanceTimersByTime(1);
		expect(raw.destroy).toHaveBeenCalledTimes(1);
	});

	it("never destroys once the close event arrived", () => {
		const raw = makeRawSocket();
		new TCPClientSocket(raw as unknown as Socket).closeGracefully(1000);

		raw.emit("close");
		jest.advanceTimersByTime(5000);

		expect(raw.destroy).not.toHaveBeenCalled();
	});
});

describe("TCPClientSocket.closeSuperseded", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("ends the socket and does not run disconnect handling", () => {
		const raw = makeRawSocket();
		const socket = new TCPClientSocket(raw as unknown as Socket);
		const onClose = jest.fn();
		socket.onClose(onClose);

		socket.closeSuperseded();
		raw.emit("close");

		expect(raw.end).toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		expect(socket.closed).toBe(true);
	});

	it("destroys after the bounded fallback when the peer never closes", () => {
		const raw = makeRawSocket();
		new TCPClientSocket(raw as unknown as Socket).closeSuperseded();

		jest.advanceTimersByTime(SUPERSEDED_CLOSE_TIMEOUT_MS - 1);
		expect(raw.destroy).not.toHaveBeenCalled();

		jest.advanceTimersByTime(1);
		expect(raw.destroy).toHaveBeenCalledTimes(1);
	});
});

describe("TCPClientSocket keepalive", () => {
	it("enables keepalive probes so a dead peer is eventually noticed", () => {
		const raw = makeRawSocket();
		new TCPClientSocket(raw as unknown as Socket);

		expect(raw.setKeepAlive).toHaveBeenCalledWith(true, TCP_KEEPALIVE_INITIAL_DELAY_MS);
	});
});

describe("TCPClientSocket lastInboundAt", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(10_000);
	});
	afterEach(() => jest.useRealTimers());

	it("starts at the moment of connection and moves forward on inbound data", () => {
		const raw = makeRawSocket();
		const socket = new TCPClientSocket(raw as unknown as Socket);
		expect(socket.lastInboundAt).toBe(10_000);

		jest.setSystemTime(33_000);
		raw.emit("data", Buffer.from([1]));

		expect(socket.lastInboundAt).toBe(33_000);
	});
});
