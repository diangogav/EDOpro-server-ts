import { Rank } from "@modules/shared/value-objects/Rank";

import { ISocket } from "../../socket/domain/ISocket";

export abstract class YgoClient {
	public readonly name: string;
	public readonly ranks: Rank[];
	protected _host: boolean;
	protected _position: number;
	protected _team: number;
	protected _socket: ISocket;
	protected _lastMessage: Buffer | null = null;
	protected _reconnecting = false;
	protected _isReady: boolean;

	constructor({
		name,
		position,
		team,
		socket,
		host,
		ranks = [],
	}: {
		name: string;
		position: number;
		team: number;
		socket: ISocket;
		host: boolean;
		ranks: Rank[];
	}) {
		this.name = name;
		this.ranks = ranks;
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

	get cache(): Buffer | null {
		return this._lastMessage;
	}

	setLastMessage(message: Buffer): void {
		this._lastMessage = message;
	}

	reconnecting(): void {
		this._reconnecting = true;
	}

	clearReconnecting(): void {
		this._reconnecting = false;
	}

	ready(): void {
		this._isReady = true;
	}

	get isReady(): boolean {
		return this._isReady;
	}

	get isReconnecting(): boolean {
		return this._reconnecting;
	}
}
