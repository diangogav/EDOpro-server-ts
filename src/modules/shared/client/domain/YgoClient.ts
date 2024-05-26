import { ISocket } from "../../socket/domain/ISocket";

export abstract class YgoClient {
	public readonly name: string;
	protected _position: number;
	protected _team: number;
	protected _socket: ISocket;

	constructor({
		name,
		position,
		team,
		socket,
	}: {
		name: string;
		position: number;
		team: number;
		socket: ISocket;
	}) {
		this.name = name;
		this._position = position;
		this._socket = socket;
		this._team = team;
	}

	get position(): number {
		return this._position;
	}

	get team(): number {
		return this._team;
	}

	get socket(): ISocket {
		return this._socket;
	}

	playerPosition(position: number, team: number): void {
		this._position = position;
		this._team = team;
	}

	spectatorPosition(position: number): void {
		this._position = position;
		this._team = 3;
	}
}
