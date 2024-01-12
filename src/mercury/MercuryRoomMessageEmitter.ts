import { MessageProcessor } from "../modules/messages/MessageProcessor";
import { MercuryClient } from "./client/domain/MercuryClient";

export class SimpleRoomMessageEmitter {
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
		this.client.sendMessageToCore(this.messageProcessor.payload);
		this.processMessage();
	}
}
