import { Client } from "../../../client/domain/Client";
import { BufferReader } from "../../domain/BufferReader";
import { RoomMessageHandlerCommandStrategy } from "./RoomMessageHandlerCommandStrategy";

export class RoomMessageHandlerContext {
	readonly client: Client;
	readonly clients: Client[];
	private strategy?: RoomMessageHandlerCommandStrategy;
	private readonly bufferReader: BufferReader;

	constructor(data: Buffer, client: Client, clients: Client[]) {
		this.client = client;
		this.clients = clients;
		this.bufferReader = new BufferReader(data);
	}

	get data(): Buffer {
		return this.bufferReader.data;
	}

	setStrategy(strategy: RoomMessageHandlerCommandStrategy): void {
		this.strategy = strategy;
	}

	execute(): void {
		if (!this.strategy) {
			return;
		}
		this.strategy.execute();
	}

	isDataEmpty(): boolean {
		return this.bufferReader.IsDataEmpty();
	}

	readHeader(): Buffer {
		return this.bufferReader.readHeader();
	}

	readBody(maxBytesLength: number): Buffer {
		return this.bufferReader.readBody(maxBytesLength);
	}
}
