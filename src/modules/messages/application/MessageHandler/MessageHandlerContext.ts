import net from "net";

import { BufferReader } from "../../domain/BufferReader";
import { Message } from "../../Message";
import { MessageHandlerCommandStrategy } from "./MessageHandlerCommandStrategy";

export class MessageHandlerContext {
	readonly socket: net.Socket;
	private previousMessage: Message;
	private strategy?: MessageHandlerCommandStrategy;
	private readonly bufferReader: BufferReader;

	constructor(data: Buffer, socket: net.Socket) {
		this.socket = socket;
		this.bufferReader = new BufferReader(data);
	}

	setStrategy(strategy: MessageHandlerCommandStrategy): void {
		this.strategy = strategy;
	}

	getPreviousMessages(): Message {
		return this.previousMessage;
	}

	updatePreviousMessage(message: Message): void {
		this.previousMessage = message;
	}

	readHeader(): Buffer {
		return this.bufferReader.readHeader();
	}

	readBody(maxBytesLength: number): Buffer {
		return this.bufferReader.readBody(maxBytesLength);
	}

	isDataEmpty(): boolean {
		return this.bufferReader.IsDataEmpty();
	}

	execute(): void {
		if (!this.strategy) {
			return;
		}
		this.strategy.execute();
	}
}
