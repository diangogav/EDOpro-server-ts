import { Client } from "../../../client/domain/Client";
import { Room } from "../../../room/domain/Room";
import { BufferReader } from "../../domain/BufferReader";
import { Message } from "../../Message";
import { ClientMessage } from "../MessageHandler/MessageProcessor";
import { RoomMessageHandlerCommandStrategy } from "./RoomMessageHandlerCommandStrategy";

export class RoomMessageHandlerContext {
	readonly client: Client;
	readonly clients: Client[];
	readonly room: Room;
	private strategy?: RoomMessageHandlerCommandStrategy;
	private readonly bufferReader: BufferReader;
	private readonly previousMessage: Message;
	private readonly message: ClientMessage;

	constructor(message: ClientMessage, client: Client, clients: Client[], room: Room) {
		this.client = client;
		this.clients = clients;
		this.room = room;
		this.message = message;
		// this.bufferReader = new BufferReader(data);
	}

	get data(): Buffer {
		return this.bufferReader.data;
	}

	getPreviousMessages(): Buffer {
		// return this.previousMessage;
		return this.message.previousMessage;
	}

	// updatePreviousMessage(message: Message): void {
	// 	this.previousMessage = message;
	// }

	setStrategy(strategy: RoomMessageHandlerCommandStrategy): void {
		this.strategy = strategy;
	}

	execute(): void {
		if (!this.strategy) {
			return;
		}
		this.strategy.execute();
	}

	// isDataEmpty(): boolean {
	// 	return this.bufferReader.IsDataEmpty();
	// }

	// readHeader(): Buffer {
	// 	return this.bufferReader.readHeader();
	// }

	readBody(): Buffer {
		return this.message.data;
	}
}
