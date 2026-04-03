import { YgoClient } from "../../../shared/client/domain/YgoClient";
import { Logger } from "../../../shared/logger/domain/Logger";
import { Team } from "../../../shared/room/Team";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { SimpleRoomMessageEmitter } from "../../SimpleRoomMessageEmitter";
import { YGOProRoom } from "../../room/domain/YGOProRoom";

export class YGOProClient extends YgoClient {
	public readonly logger: Logger;
	private _connectedToCore = false;
	private _needSpectatorMessages = false;
	private readonly _roomMessageEmitter: SimpleRoomMessageEmitter;
	private _rpsChosen: boolean;
	private _captain: boolean = false;

	constructor({
		name,
		socket,
		logger,
		position,
		room,
		host,
		id,
		team,
	}: {
		name: string;
		socket: ISocket;
		logger: Logger;
		position: number;
		room: YGOProRoom;
		host: boolean;
		id: string | null;
		team: Team
	}) {
		super({ name, position, team, socket, host, id });
		this.logger = logger.child({ clientName: name, roomId: room.id, file: "YGOProClient" });

		this._roomMessageEmitter = new SimpleRoomMessageEmitter(this, room);

		this._socket.onMessage((data: Buffer) => {
			this._roomMessageEmitter.handleMessage(data);
		});

		this._isReady = false;
	}

	sendMessageToClient(message: Buffer): void {
		this._socket.send(message);
	}

	destroy(): void {
		this._socket.destroy();
	}

	playerPosition(position: number, team: Team): void {
		super.playerPosition(position, team);
	}

	setNeedSpectatorMessages(value: boolean): void {
		this._needSpectatorMessages = value;
	}

	setHost(value: boolean): void {
		this._host = value;
	}

	setSocket(socket: ISocket): void {
		socket.onMessage((data: Buffer) => {
			this._roomMessageEmitter.handleMessage(data);
		});
		this._socket = socket;
		this._ipAddress = socket.remoteAddress ?? null;
	}

	rpsChoose(): void {
		this._rpsChosen = true;
	}

	rpsRpsChoose(): void {
		this._rpsChosen = false;
	}

	get socket(): ISocket {
		return this._socket;
	}

	get connectedToCore(): boolean {
		return this._connectedToCore;
	}

	get needSpectatorMessages(): boolean {
		return this._needSpectatorMessages;
	}

	get rpsChosen(): boolean {
		return this._rpsChosen;
	}

	captain(): void {
		this._captain = true;
	}

	get isCaptain(): boolean {
		return this._captain;
	}
}
