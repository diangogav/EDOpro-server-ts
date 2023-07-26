import { PlayerChangeClientMessage } from "../../../server-to-client/PlayerChangeClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class NotReadyCommandStrategy implements RoomMessageHandlerCommandStrategy {
	private readonly STATUS = 0xa;
	constructor(
		private readonly context: RoomMessageHandlerContext // private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const status = (this.context.client.position << 4) | this.STATUS;
		const message = PlayerChangeClientMessage.create({ status });
		this.context.clients.forEach((client) => {
			client.sendMessage(message);
		});

		this.context.client.notReady();
		// this.afterExecuteCallback();
	}
}
