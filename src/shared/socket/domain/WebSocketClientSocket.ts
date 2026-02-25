import WebSocket from "ws";

import { ISocket } from "./ISocket";

export class WebSocketClientSocket implements ISocket {
	id?: string;
	roomId?: number;
	private readonly socket: WebSocket;
	private isClosed = false;

	constructor(socket: WebSocket) {
		this.socket = socket;
		this.socket.on("close", () => {
			this.isClosed = true;
		});
		this.socket.on("error", () => {
			this.isClosed = true;
		});
	}

	removeAllListeners(): void {
		this.socket.removeAllListeners();
	}

	send(message: Buffer): void {
		if (this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(message);
		}
	}

	onMessage(callback: (message: Buffer) => void): void {
		this.socket.on("message", (data: WebSocket.Data) => {
			if (Buffer.isBuffer(data)) {
				callback(data);
			} else if (data instanceof ArrayBuffer) {
				callback(Buffer.from(data));
			} else if (Array.isArray(data)) {
				callback(Buffer.concat(data.map((b) => Buffer.from(b))));
			}
		});
	}

	onClose(callback: () => void): void {
		this.socket.on("close", callback);
	}

	close(): void {
		this.socket.close();
	}

	destroy(): void {
		this.socket.terminate();
	}

	get remoteAddress(): string | undefined {
		// Express/WS doesn't have a direct remoteAddress like net.Socket,
		// but we can try to get it from the underlying socket if available.
		// Note: This might return undefined depending on the environment.
		// @ts-expect-error - _socket is private in ws library but contains remoteAddress
		return this.socket._socket?.remoteAddress;
	}

	get closed(): boolean {
		return this.isClosed || this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING;
	}
}
