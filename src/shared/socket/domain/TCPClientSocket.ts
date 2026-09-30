import { Socket } from "net";

import { ISocket } from "./ISocket";

export class TCPClientSocket implements ISocket {
	id?: string;
	roomId?: number;
	private readonly socket: Socket;

	private isClosed = false;
	private isClosing = false;
	private messageCallback?: (data: Buffer) => void;
	private closeCallback?: () => void;

	constructor(socket: Socket) {
		this.socket = socket;
		this.socket.setKeepAlive(true, 1000);
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

	setRoomId(roomId: number): void {
		this.roomId = roomId;
	}

	setId(id: string): void {
		this.id = id;
	}

	get remoteAddress(): string | undefined {
		return this.socket.remoteAddress;
	}

	get closed(): boolean {
		return this.isClosed || this.isClosing || this.socket.closed;
	}
}
