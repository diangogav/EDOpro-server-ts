import { YGOClientSocket } from "../../socket/domain/YGOClientSocket";

export abstract class YgoClient {
	public readonly name: string;
	protected _position: number;
	protected _socket: YGOClientSocket;

	constructor({
		name,
		position,
		socket,
	}: {
		name: string;
		position: number;
		socket: YGOClientSocket;
	}) {
		this.name = name;
		this._position = position;
		this._socket = socket;
	}

	get position(): number {
		return this._position;
	}

	get socket(): YGOClientSocket {
		return this._socket;
	}
}
