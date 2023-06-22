import { Deck } from "../../../../deck/domain/Deck";
import { PlayerChangeClientMessage } from "../../../server-to-client/PlayerChangeClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class ReadyCommandStrategy implements RoomMessageHandlerCommandStrategy {
	private readonly STATUS = 0x09;

	constructor(
		private readonly context: RoomMessageHandlerContext,
		private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const status = (this.context.client.position << 4) | this.STATUS;
		const message = PlayerChangeClientMessage.create({ status });
		const deck = this.context.getPreviousMessages() as Deck;
		this.context.room.setDecksToPlayer(this.context.client.position, deck);
		this.context.clients.forEach((client) => {
			client.socket.write(message);
		});
		this.context.client.ready();
		this.afterExecuteCallback();
	}
}
