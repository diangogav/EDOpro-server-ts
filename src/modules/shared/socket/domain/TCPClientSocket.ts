import { Socket } from "net";

import { ISocket } from "./ISocket";

export class TCPClientSocket implements ISocket {
	id?: string;
	roomId?: number;
	private readonly socket: Socket;

	constructor(socket: Socket) {
		this.socket = socket;
		this.socket.setKeepAlive(true, 1000);
	}

	removeAllListeners(): void {
		this.socket.removeAllListeners();
	}

	send(message: Buffer): void {
		this.socket.write(message);
	}

	onMessage(callback: (message: Buffer) => void): void {
		this.socket.on("data", (data) => callback(data));
	}

	onClose(callback: () => void): void {
		this.socket.on("end", callback);
	}

	close(): void {
		this.socket.end();
	}

	destroy(): void {
		this.socket.removeAllListeners();
		this.socket.destroy();
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
		return this.socket.closed;
	}
}
