import { Client } from "../../client/domain/Client";
import { Commands } from "../domain/Commands";
import { Message } from "../Message";
import { DuelStartClientMessage } from "../server-to-client/DuelStartClientMessage";
import { PlayerChangeClientMessage } from "../server-to-client/PlayerChangeClientMessage";
import { RPSChooseClientMessage } from "../server-to-client/RPSChooseClientMessage";
import { UpdateDeckMessageSizeCalculator } from "./UpdateDeckMessageSizeCalculator";

export class RoomMessageHandler {
	private readonly HEADER_BYTES_LENGTH = 3;
	private data: Buffer;
	private readonly previousMessage: Message;
	private readonly client: Client;
	private readonly clients: Client[];

	constructor(data: Buffer, client: Client, clients: Client[]) {
		this.data = data;
		this.client = client;
		this.clients = clients;
	}

	read(): void {
		if (this.data.length === 0) {
			return;
		}
		const header = this.readHeader();
		const command = header.subarray(2, 3).readInt8();

		if (command === Commands.UPDATE_DECK) {
			const messageSize = new UpdateDeckMessageSizeCalculator(this.data).calculate();
			this.readBody(messageSize);
			this.read();
		}

		if (command === Commands.READY) {
			const status = this.client.position === 0 ? 0x09 : 0x19;
			const message = PlayerChangeClientMessage.create({ status });
			this.clients.forEach((client) => {
				client.socket.write(message);
			});
			this.read();
		}

		if (command === Commands.NOT_READY) {
			const status = this.client.position === 0 ? 0x0a : 0x1a;
			const message = PlayerChangeClientMessage.create({ status });
			this.clients.forEach((client) => {
				client.socket.write(message);
			});
			this.read();
		}

		if (command === Commands.TRY_START) {
			const duelStartMessage = DuelStartClientMessage.create();
			this.clients.forEach((client) => {
				client.socket.write(duelStartMessage);
			});

			const rpsChooseMessage = RPSChooseClientMessage.create();
			this.clients.forEach((client) => {
				client.socket.write(rpsChooseMessage);
			});
		}
	}

	private readHeader(): Buffer {
		const header = this.data.subarray(0, this.HEADER_BYTES_LENGTH);
		this.data = this.data.subarray(this.HEADER_BYTES_LENGTH, this.data.length);

		return header;
	}

	private readBody(maxBytesLength: number): Buffer {
		const body = this.data.subarray(0, maxBytesLength);
		this.data = this.data.subarray(maxBytesLength, this.data.length);

		return body;
	}
}
