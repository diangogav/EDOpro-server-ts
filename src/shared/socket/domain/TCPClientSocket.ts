import { Socket } from "net";

import { ISocket } from "./ISocket";
import { SUPERSEDED_CLOSE_TIMEOUT_MS } from "./sessionSuperseded";
import { TCP_KEEPALIVE_INITIAL_DELAY_MS } from "./tcpKeepAlive";

export class TCPClientSocket implements ISocket {
	readonly transport = "tcp" as const;
	id?: string;
	roomId?: number;
	private readonly socket: Socket;
	private inboundAt = Date.now();

	private isClosed = false;
	private isClosing = false;
	private messageCallback?: (data: Buffer) => void;
	private closeCallback?: () => void;

	constructor(socket: Socket) {
		this.socket = socket;
		this.socket.setKeepAlive(true, TCP_KEEPALIVE_INITIAL_DELAY_MS);
		this.socket.on("data", () => {
			this.inboundAt = Date.now();
		});
		this.socket.on("close", () => {
			this.isClosed = true;
		});
		this.socket.on("error", () => {
			this.isClosed = true;
		});
	}

	removeAllListeners(): void {
		if (this.messageCallback) {
			this.socket.off("data", this.messageCallback);
			this.messageCallback = undefined;
		}
		if (this.closeCallback) {
			this.socket.off("close", this.closeCallback);
			this.closeCallback = undefined;
		}
	}

	send(message: Buffer): void {
		this.socket.write(message);
	}

	onMessage(callback: (message: Buffer) => void): void {
		this.messageCallback = (data: Buffer) => callback(data);
		this.socket.on("data", this.messageCallback);
	}

	onClose(callback: () => void): void {
		this.closeCallback = callback;
		this.socket.on("close", this.closeCallback);
	}

	close(): void {
		this.socket.end();
	}

	destroy(): void {
		this.removeAllListeners();
		this.socket.destroy();
	}

	closeGracefully(timeoutMs: number): void {
		if (this.isClosing) return;
		this.isClosing = true;
		this.removeAllListeners();

		// end() flushes pending writes before sending FIN; destroy() is only the
		// bounded fallback for a peer that never closes its side.
		const fallback = setTimeout(() => this.socket.destroy(), timeoutMs);
		fallback.unref?.();
		this.socket.once("close", () => clearTimeout(fallback));
		this.socket.end();
	}

	closeSuperseded(): void {
		this.closeGracefully(SUPERSEDED_CLOSE_TIMEOUT_MS);
	}

	setRoomId(roomId: number): void {
		this.roomId = roomId;
	}

	setId(id: string): void {
		this.id = id;
	}

	get lastInboundAt(): number {
		return this.inboundAt;
	}

	get remoteAddress(): string | undefined {
		return this.socket.remoteAddress;
	}

	get closed(): boolean {
		return this.isClosed || this.isClosing || this.socket.closed;
	}
}
