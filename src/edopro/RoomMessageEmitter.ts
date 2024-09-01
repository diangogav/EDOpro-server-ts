import { Client } from "./client/domain/Client";
import { MessageProcessor } from "./messages/MessageProcessor";
import { Room } from "./room/domain/Room";

export class RoomMessageEmitter {
	private readonly messageProcessor: MessageProcessor;

	constructor(private readonly client: Client, private readonly room: Room) {
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
		this.processMessage();
	}
}
