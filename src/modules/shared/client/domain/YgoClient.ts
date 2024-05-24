import { TCPClientSocket } from "../../socket/domain/TCPClientSocket";

export abstract class YgoClient {
	public readonly name: string;
	protected _position: number;
	protected _socket: TCPClientSocket;

	constructor({
		name,
		position,
		socket,
	}: {
		name: string;
		position: number;
		socket: TCPClientSocket;
	}) {
		this.name = name;
		this._position = position;
		this._socket = socket;
	}

	get position(): number {
		return this._position;
	}

	get socket(): TCPClientSocket {
		return this._socket;
	}
}
