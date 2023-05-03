import type net from "net";

export class Listener {}

export class Client {
	public readonly socket: net.Socket;
	public readonly listener: Listener;
	public readonly host: boolean;
	public readonly name: string;
	public readonly position: number;

	constructor(socket: net.Socket, host: boolean, name: string, position: number) {
		this.socket = socket;
		this.host = host;
		this.name = name;
		this.position = position;
	}
}
