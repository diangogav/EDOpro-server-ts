import type net from "net";

export class Listener {}

export class Client {
	public readonly socket: net.Socket;
	public readonly listener: Listener;
	// public readonly owner: any //?????
	// public readonly properties: { name: string }

	constructor(socket: net.Socket) {
		this.socket = socket;
	}

	start(): void {
		// console.log("Client Start");
	}
}
