import { PlayerChangeClientMessage } from "../../../server-to-client/PlayerChangeClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class NotReadyCommandStrategy implements RoomMessageHandlerCommandStrategy {
	constructor(
		private readonly context: RoomMessageHandlerContext,
		private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const status = this.context.client.position === 0 ? 10 : 26;
		const message = PlayerChangeClientMessage.create({ status });
		this.context.clients.forEach((client) => {
			client.socket.write(message);
		});

		this.afterExecuteCallback();
	}
}
