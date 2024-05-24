import { ISocket } from "../../socket/domain/ISocket";

export abstract class YgoClient {
	public readonly name: string;
	protected _position: number;
	protected _socket: ISocket;

	constructor({ name, position, socket }: { name: string; position: number; socket: ISocket }) {
		this.name = name;
		this._position = position;
		this._socket = socket;
	}

	get position(): number {
		return this._position;
	}

	get socket(): ISocket {
		return this._socket;
	}
}
