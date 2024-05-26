import net from "net";

import { ClientMessage } from "../../../modules/messages/MessageProcessor";
import { Team } from "../../../modules/room/domain/Team";
import { YgoClient } from "../../../modules/shared/client/domain/YgoClient";
import { Logger } from "../../../modules/shared/logger/domain/Logger";
import { ISocket } from "../../../modules/shared/socket/domain/ISocket";
import { MercuryCoreMessageEmitter } from "../../MercuryCoreMessageEmitter";
import { SimpleRoomMessageEmitter } from "../../MercuryRoomMessageEmitter";
import { MercuryRoom } from "../../room/domain/MercuryRoom";

export class MercuryClient extends YgoClient {
	readonly name: string;
	private readonly _coreClient: net.Socket;
	private readonly _logger: Logger;
	private _pendingMessages: Buffer[];
	private readonly _mercuryRoomMessageEmitter: MercuryCoreMessageEmitter;

	constructor({
		name,
		socket,
		logger,
		messages,
		position,
		room,
	}: {
		name: string;
		socket: ISocket;
		logger: Logger;
		messages: Buffer[];
		position: number;
		room: MercuryRoom;
	}) {
		super({ name, position, team: Team.SPECTATOR, socket });
		this._coreClient = new net.Socket();
		this._logger = logger;
		this._pendingMessages = messages;
		this._mercuryRoomMessageEmitter = new MercuryCoreMessageEmitter(this, room);

		this._coreClient.on("data", (data: Buffer) => {
			this._logger.debug(`Data incoming from mercury core ${data.toString("hex")}`);
			this._mercuryRoomMessageEmitter.handleMessage(data);
		});

		const roomMessageEmitter = new SimpleRoomMessageEmitter(this, room);

		this._socket.onMessage((data: Buffer) => {
			roomMessageEmitter.handleMessage(data);
		});
	}

	connectToCore({ url, port }: { url: string; port: number }): void {
		this._coreClient.connect(port, url, () => {
			this._logger.info(`Connected to Mercury Core at port: ${port}`);
			this.sendPendingMessages();
		});
	}

	sendMessageToCore(message: ClientMessage): void {
		this._logger.info(`SENDING TO CORE: ${message.raw.toString("hex")} `);
		this._coreClient.write(message.raw);
	}

	sendMessageToClient(message: Buffer): void {
		this._socket.send(message);
	}

	destroy(): void {
		this._logger.debug("DESTROY");
		this._coreClient.destroy();
		this._socket.destroy();
	}

	playerPosition(position: number): void {
		this._position = position;
		if (position >= 0 && position < 2) {
			super.playerPosition(position, Team.PLAYER);
		} else {
			super.playerPosition(position, Team.OPPONENT);
		}
	}

	private sendPendingMessages(): void {
		this._pendingMessages.forEach((message) => {
			this._logger.debug(`Message: ${message.toString("hex")}`);
			this._coreClient.write(message);
		});

		this._pendingMessages = [];
	}

	get socket(): ISocket {
		return this._socket;
	}
}
