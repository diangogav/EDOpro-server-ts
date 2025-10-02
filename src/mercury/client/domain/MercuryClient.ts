import net from "net";
import { MercuryPlayerInfoToCoreMessage } from "src/mercury/messages/server-to-core";

import { ClientMessage } from "../../../edopro/messages/MessageProcessor";
import { YgoClient } from "../../../shared/client/domain/YgoClient";
import { Logger } from "../../../shared/logger/domain/Logger";
import { Team } from "../../../shared/room/Team";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { MercuryCoreMessageEmitter } from "../../MercuryCoreMessageEmitter";
import { SimpleRoomMessageEmitter } from "../../MercuryRoomMessageEmitter";
import { MercuryRoom } from "../../room/domain/MercuryRoom";

export class MercuryClient extends YgoClient {
	public readonly logger: Logger;
	private readonly _coreClient: net.Socket;
	private _pendingMessages: Buffer[];
	private readonly _mercuryRoomMessageEmitter: MercuryCoreMessageEmitter;
	private _connectedToCore = false;
	private _needSpectatorMessages = false;
	private readonly _roomMessageEmitter: SimpleRoomMessageEmitter;
	private _rpsChosen: boolean;

	constructor({
		name,
		socket,
		logger,
		messages,
		position,
		room,
		host,
		id,
	}: {
		name: string;
		socket: ISocket;
		logger: Logger;
		messages: Buffer[];
		position: number;
		room: MercuryRoom;
		host: boolean;
		id: string | null;
	}) {
		super({ name, position, team: Team.SPECTATOR, socket, host, id });
		this._coreClient = new net.Socket();
		this.logger = logger.child({ clientName: name, roomId: room.id, file: "MercuryClient" });
		this._pendingMessages = messages;
		this._mercuryRoomMessageEmitter = new MercuryCoreMessageEmitter(this, room);

		this._coreClient.on("data", (data: Buffer) => {
			this.logger.debug(`Data incoming from mercury core ${data.toString("hex")}`);
			this._mercuryRoomMessageEmitter.handleMessage(data);
		});

		this._coreClient.on("connect", () => {
			this._connectedToCore = true;
		});

		this._roomMessageEmitter = new SimpleRoomMessageEmitter(this, room);

		this._socket.onMessage((data: Buffer) => {
			this._roomMessageEmitter.handleMessage(data);
		});
	}

	connectToCore({ url, port }: { url: string; port: number }): void {
		if (this._connectedToCore) {
			return;
		}
		this._coreClient.connect(port, url, () => {
			this.logger.debug(`Connected to Mercury Core at port: ${port}`);
			this.sendPendingMessages();
		});
	}

	sendMessageToCore(message: ClientMessage): void {
		this.logger.debug(`SENDING TO CORE: ${message.raw.toString("hex")} `);
		this._coreClient.write(message.raw);
	}

	sendToCore(message: Buffer): void {
		this.logger.debug(`SENDING TO CORE: ${message.toString("hex")} `);
		this._coreClient.write(message);
	}

	sendMessageToClient(message: Buffer): void {
		this._socket.send(message);
	}

	destroy(): void {
		this.logger.debug("DESTROY");
		this._coreClient.destroy();
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

	private sendPendingMessages(): void {
		this._pendingMessages.forEach((message) => {
			this.logger.debug(`Message: ${message.toString("hex")}`);
			const messageType = message.readInt8(2);
			if (messageType === 0x10) {
				const playerInfoMessage = MercuryPlayerInfoToCoreMessage.create(this.name);
				this._coreClient.write(playerInfoMessage);
			} else {
				this._coreClient.write(message);
			}
		});

		this._pendingMessages = [];
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
}
