import { MessageProcessor } from "../modules/messages/MessageProcessor";
import { MercuryClient } from "./client/domain/MercuryClient";

export class MercuryCoreMessageEmitter {
	private readonly messageProcessor: MessageProcessor;

	constructor(private readonly client: MercuryClient) {
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
		// this.room.emitRoomEvent(
		// 	this.messageProcessor.command as unknown as string,
		// 	this.messageProcessor.payload,
		// 	this.client
		// );
		this.client.sendMessageToClient(this.messageProcessor.payload.raw);
		this.processMessage();
	}
}
