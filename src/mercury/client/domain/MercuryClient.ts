import net from "net";

import { ClientMessage } from "../../../modules/messages/MessageProcessor";
import { Logger } from "../../../modules/shared/logger/domain/Logger";
import { YGOClientSocket } from "../../../socket-server/HostServer";
import { MercuryCoreMessageEmitter } from "../../MercuryCoreMessageEmitter";
import { SimpleRoomMessageEmitter } from "../../MercuryRoomMessageEmitter";

export class MercuryClient {
	readonly name: string;
	readonly position: number;
	private readonly _coreClient: net.Socket;
	private readonly _socket: YGOClientSocket;
	private readonly _logger: Logger;
	private _pendingMessages: Buffer[];
	private readonly _mercuryRoomMessageEmitter: MercuryCoreMessageEmitter;

	constructor({
		name,
		socket,
		logger,
		messages,
		position,
	}: {
		name: string;
		socket: YGOClientSocket;
		logger: Logger;
		messages: Buffer[];
		position: number;
	}) {
		this.name = name;
		this.position = position;
		this._socket = socket;
		this._coreClient = new net.Socket();
		this._logger = logger;
		this._pendingMessages = messages;
		this._mercuryRoomMessageEmitter = new MercuryCoreMessageEmitter(this);

		this._coreClient.on("data", (data: Buffer) => {
			this._logger.info(`Data incoming from mercury core ${data.toString("hex")}`);
			this._mercuryRoomMessageEmitter.handleMessage(data);
		});

		const roomMessageEmitter = new SimpleRoomMessageEmitter(this);

		this._socket.on("data", (data: Buffer) => {
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
		this._socket.write(message);
	}

	private sendPendingMessages(): void {
		this._pendingMessages.forEach((message) => {
			this._logger.info(`Message: ${message.toString("hex")}`);
			this._coreClient.write(message);
		});

		this._pendingMessages = [];
	}
}
