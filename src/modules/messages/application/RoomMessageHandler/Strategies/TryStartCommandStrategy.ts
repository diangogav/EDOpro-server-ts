import { DuelStartClientMessage } from "../../../server-to-client/DuelStartClientMessage";
import { RPSChooseClientMessage } from "../../../server-to-client/RPSChooseClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class TryStartCommandStrategy implements RoomMessageHandlerCommandStrategy {
	constructor(
		private readonly context: RoomMessageHandlerContext // private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const duelStartMessage = DuelStartClientMessage.create();
		this.context.clients.forEach((client) => {
			client.socket.write(duelStartMessage);
		});

		this.context.room.spectators.forEach((client) => {
			client.socket.write(duelStartMessage);
		});

		const t0Client = this.context.clients.filter((_client) => _client.team === 0)[0];
		const t1Client = this.context.clients.filter((_client) => _client.team === 1)[0];

		const rpsChooseMessage = RPSChooseClientMessage.create();
		t0Client.socket.write(rpsChooseMessage);
		t1Client.socket.write(rpsChooseMessage);

		this.context.room.initializeHistoricalData();
		this.context.room.rps();
		// this.afterExecuteCallback();
	}
}
