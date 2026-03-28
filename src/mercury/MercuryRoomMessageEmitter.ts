import { MessageProcessor } from "../shared/messages/MessageProcessor";
import { MercuryClient } from "./client/domain/MercuryClient";
import { YGOProRoom } from "./room/domain/YGOProRoom";

export class SimpleRoomMessageEmitter {
	private readonly messageProcessor: MessageProcessor;

	constructor(private readonly client: MercuryClient, private readonly room: YGOProRoom) {
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
		this.room.emitRoomEvent(
			this.messageProcessor.command as unknown as string,
			this.messageProcessor.payload,
			this.client
		);
		// this.client.sendMessageToCore(this.messageProcessor.payload);
		this.processMessage();
	}
}
