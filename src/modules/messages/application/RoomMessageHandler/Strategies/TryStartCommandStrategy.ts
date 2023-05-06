import { DuelStartClientMessage } from "../../../server-to-client/DuelStartClientMessage";
import { RPSChooseClientMessage } from "../../../server-to-client/RPSChooseClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class TryStartCommandStrategy implements RoomMessageHandlerCommandStrategy {
	constructor(
		private readonly context: RoomMessageHandlerContext,
		private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const duelStartMessage = DuelStartClientMessage.create();
		this.context.clients.forEach((client) => {
			client.socket.write(duelStartMessage);
		});

		const rpsChooseMessage = RPSChooseClientMessage.create();
		this.context.clients.forEach((client) => {
			client.socket.write(rpsChooseMessage);
		});

		this.afterExecuteCallback();
	}
}
