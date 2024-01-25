import { MessageProcessor } from "../modules/messages/MessageProcessor";
import { MercuryClient } from "./client/domain/MercuryClient";
import { MercuryRoom } from "./room/domain/MercuryRoom";

export class MercuryCoreMessageEmitter {
	private readonly messageProcessor: MessageProcessor;

	constructor(private readonly client: MercuryClient, private readonly room: MercuryRoom) {
		this.messageProcessor = new MessageProcessor();
	}

	handleMessage(data: Buffer): void {
		this.messageProcessor.read(data);
		this.processMessage();
	}

	processMessage(): void {
		if (!this.messageProcessor.isMessageReady()) {
			return;
		}

		this.messageProcessor.process();

		//TODO: Mapping all commads numbers to string
		if (this.messageProcessor.payload.command === 4) {
			this.room.emitRoomEvent("SELECT_TP", this.messageProcessor.payload, this.client);
		}

		this.client.sendMessageToClient(this.messageProcessor.payload.raw);

		this.processMessage();
	}
}
