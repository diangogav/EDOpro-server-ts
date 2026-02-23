import { ISocket } from "../../socket/domain/ISocket";

export abstract class YgoClient {
	public readonly id: string | null;
	public readonly name: string;
	protected _host: boolean;
	protected _position: number;
	protected _team: number;
	protected _socket: ISocket;
	protected _lastMessage: Buffer | null = null;
	protected _reconnecting = false;
	protected _isReady: boolean;
	protected _ipAddress: string | null;
	protected _reconnectionToken: string | null = null;

	constructor({
		name,
		position,
		team,
		socket,
		host,
		id,
	}: {
		name: string;
		position: number;
		team: number;
		socket: ISocket;
		host: boolean;
		id: string | null;
	}) {
		this.id = id;
		this.name = name;
		this._position = position;
		this._socket = socket;
		this._team = team;
		this._host = host;
		this._ipAddress = socket.remoteAddress ?? null;
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

	get reconnectionToken(): string | null {
		return this._reconnectionToken;
	}

	setReconnectionToken(token: string): void {
		this._reconnectionToken = token;
	}

	clearReconnectionToken(): void {
		this._reconnectionToken = null;
	}
}
