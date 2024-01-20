import net from "net";

import { ClientMessage, MessageProcessor } from "../../../modules/messages/MessageProcessor";
import { Logger } from "../../../modules/shared/logger/domain/Logger";
import { YGOClientSocket } from "../../../socket-server/HostServer";
import { SimpleRoomMessageEmitter } from "../../MercuryRoomMessageEmitter";

export class MercuryClient {
	readonly name: string;
	readonly position: number;
	private readonly _coreClient: net.Socket;
	private readonly _socket: YGOClientSocket;
	private readonly _logger: Logger;
	private _pendingMessages: Buffer[];
	private readonly _messageProcessor: MessageProcessor;

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
		this._messageProcessor = new MessageProcessor();

		this._coreClient.on("data", (data: Buffer) => {
			this._logger.info(`Data incoming from mercury core ${data.toString("hex")}`);
			this._messageProcessor.read(data);
			this.processMessage();
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

	private sendPendingMessages(): void {
		this._pendingMessages.forEach((message) => {
			this._logger.info(`Message: ${message.toString("hex")}`);
			this._coreClient.write(message);
		});

		this._pendingMessages = [];
	}

	private processMessage(): void {
		if (!this._messageProcessor.isMessageReady()) {
			return;
		}

		this._messageProcessor.process();
		this._logger.info(
			`Sending Data To ${this.name}: ${this._messageProcessor.payload.raw.toString("hex")}`
		);
		this._socket.write(this._messageProcessor.payload.raw);
		this.processMessage();
	}
}
