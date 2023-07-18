import { YGOClientSocket } from "../../../../socket-server/HostServer";
import { BufferReader } from "../../domain/BufferReader";
import { Message } from "../../Message";
import { MessageHandlerCommandStrategy } from "./MessageHandlerCommandStrategy";

export class MessageHandlerContext {
	readonly socket: YGOClientSocket;
	private previousMessage: Message;
	private strategy?: MessageHandlerCommandStrategy;
	private readonly bufferReader: BufferReader;

	constructor(data: Buffer, socket: YGOClientSocket) {
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

	messageLength(): number {
		return this.bufferReader.length;
	}

	async execute(): Promise<void> {
		if (!this.strategy) {
			return;
		}
		await this.strategy.execute();
	}
}
