import WebSocket from "ws";

import { ISocket } from "./ISocket";
import {
	SESSION_SUPERSEDED_CLOSE_CODE,
	SESSION_SUPERSEDED_CLOSE_REASON,
	SUPERSEDED_CLOSE_TIMEOUT_MS,
} from "./sessionSuperseded";

export class WebSocketClientSocket implements ISocket {
	readonly transport = "ws" as const;
	id?: string;
	roomId?: number;
	resolvedUserId?: string;
	public supportsLobbyMetadata?: boolean;
	public clientName?: string;
	private readonly socket: WebSocket;
	private inboundAt = Date.now();
	private isClosed = false;
	private isClosing = false;
	private messageCallback?: (data: WebSocket.Data) => void;
	private closeCallback?: () => void;

	constructor(socket: WebSocket) {
		this.socket = socket;
		// Listens independently of onMessage so heartbeat pongs and frames that
		// arrive while the pump is detached still count as proof of life.
		const markInbound = () => {
			this.inboundAt = Date.now();
		};
		this.socket.on("message", markInbound);
		this.socket.on("pong", markInbound);
		this.socket.on("close", () => {
			this.isClosed = true;
		});
		this.socket.on("error", () => {
			this.isClosed = true;
		});
	}

	removeAllListeners(): void {
		if (this.messageCallback) {
			this.socket.off("message", this.messageCallback);
			this.messageCallback = undefined;
		}
		if (this.closeCallback) {
			this.socket.off("close", this.closeCallback);
			this.closeCallback = undefined;
		}
	}

	send(message: Buffer): void {
		if (this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(message);
		}
	}

	onMessage(callback: (message: Buffer) => void): void {
		this.messageCallback = (data: WebSocket.Data) => {
			if (Buffer.isBuffer(data)) {
				callback(data);
			} else if (data instanceof ArrayBuffer) {
				callback(Buffer.from(data));
			} else if (Array.isArray(data)) {
				callback(Buffer.concat(data.map((b) => Buffer.from(b))));
			}
		};
		this.socket.on("message", this.messageCallback);
	}

	onClose(callback: () => void): void {
		this.closeCallback = callback;
		this.socket.on("close", this.closeCallback);
	}

	close(): void {
		this.socket.close();
	}

	destroy(): void {
		this.removeAllListeners();
		this.socket.terminate();
	}

	closeGracefully(timeoutMs: number): void {
		this.closeWith(timeoutMs, 1000);
	}

	closeSuperseded(): void {
		this.closeWith(
			SUPERSEDED_CLOSE_TIMEOUT_MS,
			SESSION_SUPERSEDED_CLOSE_CODE,
			SESSION_SUPERSEDED_CLOSE_REASON,
		);
	}

	private closeWith(timeoutMs: number, code: number, reason?: string): void {
		if (this.isClosing) return;
		this.isClosing = true;
		this.removeAllListeners();

		// ws flushes queued frames before the close frame; terminate() is only the
		// bounded fallback for a peer that never completes the handshake.
		const fallback = setTimeout(() => this.socket.terminate(), timeoutMs);
		fallback.unref?.();
		this.socket.once("close", () => clearTimeout(fallback));
		if (reason === undefined) {
			this.socket.close(code);
		} else {
			this.socket.close(code, reason);
		}
	}

	get lastInboundAt(): number {
		return this.inboundAt;
	}

	get remoteAddress(): string | undefined {
		// Express/WS doesn't have a direct remoteAddress like net.Socket,
		// but we can try to get it from the underlying socket if available.
		// Note: This might return undefined depending on the environment.
		// @ts-expect-error - _socket is private in ws library but contains remoteAddress
		return this.socket._socket?.remoteAddress;
	}

	get closed(): boolean {
		return (
			this.isClosed ||
			this.isClosing ||
			this.socket.readyState === WebSocket.CLOSED ||
			this.socket.readyState === WebSocket.CLOSING
		);
	}
}
