import { YGOClientSocket } from "../../../../socket-server/HostServer";
import { BufferReader } from "../../domain/BufferReader";
import { Message } from "../../Message";
import { MessageHandlerCommandStrategy } from "./MessageHandlerCommandStrategy";
import { ClientMessage } from "./MessageProcessor";

export class MessageHandlerContext {
	readonly socket: YGOClientSocket;
	private readonly previousMessage: Message;
	private strategy?: MessageHandlerCommandStrategy;
	private readonly bufferReader: BufferReader;
	private readonly message: ClientMessage;

	constructor(message: ClientMessage, socket: YGOClientSocket) {
		this.socket = socket;
		this.message = message;
		// this.bufferReader = new BufferReader(data);
	}

	setStrategy(strategy: MessageHandlerCommandStrategy): void {
		this.strategy = strategy;
	}

	getPreviousMessages(): Buffer {
		return this.message.previousMessage;
	}

	// updatePreviousMessage(message: Message): void {
	// 	this.previousMessage = message;
	// }

	// readHeader(): Buffer {
	// 	return this.bufferReader.readHeader();
	// }

	readBody(): Buffer {
		// return this.bufferReader.readBody(maxBytesLength);
		return this.message.data;
	}

	// isDataEmpty(): boolean {
	// 	return this.bufferReader.IsDataEmpty();
	// }

	// messageLength(): number {
	// 	return this.bufferReader.length;
	// }

	async execute(): Promise<void> {
		if (!this.strategy) {
			return;
		}
		await this.strategy.execute();
	}
}
