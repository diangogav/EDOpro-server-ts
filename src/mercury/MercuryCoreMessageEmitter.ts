import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";

import { MessageProcessor } from "../edopro/messages/MessageProcessor";
import { MercuryClient } from "./client/domain/MercuryClient";
import { MercuryServerToClientMessages } from "./messages/domain/MercuryServerToClientMessages";
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

		const command = MercuryServerToClientMessages.get(this.messageProcessor.payload.command);
		if (command) {
			this.room.emitRoomEvent(command, this.messageProcessor.payload, this.client);
		}

		if (command === "JOIN_GAME") {
			const raw = Buffer.from(this.messageProcessor.payload.raw);
			const banListHash = this.room.banListHash;
			const banList = BanListMemoryRepository.findByHash(banListHash);
			if (banList) {
				const unsignedValue = banList.mercuryHash >>> 0;
				raw.writeUInt32LE(unsignedValue, 3);
				this.client.sendMessageToClient(raw);
			} else {
				this.client.sendMessageToClient(this.messageProcessor.payload.raw);
			}
		} else {
			this.client.sendMessageToClient(this.messageProcessor.payload.raw);
		}

		this.processMessage();
	}
}
