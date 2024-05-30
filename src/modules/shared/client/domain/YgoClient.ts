import { ISocket } from "../../socket/domain/ISocket";

export abstract class YgoClient {
	public readonly name: string;
	protected _host: boolean;
	protected _position: number;
	protected _team: number;
	protected _socket: ISocket;

	constructor({
		name,
		position,
		team,
		socket,
		host,
	}: {
		name: string;
		position: number;
		team: number;
		socket: ISocket;
		host: boolean;
	}) {
		this.name = name;
		this._position = position;
		this._socket = socket;
		this._team = team;
		this._host = host;
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

	get isSpectator(): boolean {
		return this._team === 3;
	}

	get host(): boolean {
		return this._host;
	}
}
