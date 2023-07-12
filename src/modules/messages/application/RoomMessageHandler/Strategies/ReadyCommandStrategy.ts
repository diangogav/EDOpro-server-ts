import { Deck } from "../../../../deck/domain/Deck";
import { DuelStartClientMessage } from "../../../server-to-client/DuelStartClientMessage";
import { StartDuelClientMessage } from "../../../server-to-client/game-messages/StartDuelClientMessage";
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
		if (this.context.client.isReconnecting) {
			this.context.client.socket.write(DuelStartClientMessage.create());
			this.context.client.socket.write(
				StartDuelClientMessage.create({
					lp: this.context.room.startLp,
					team: this.context.room.firstToPlay === this.context.client.team ? 0 : 1,
					playerMainDeckSize: this.context.room.playerMainDeckSize,
					playerExtraDeckSize: this.context.room.playerExtraDeckSize,
					opponentMainDeckSize: this.context.room.opponentMainDeckSize,
					opponentExtraDeckSize: this.context.room.opponentExtraDeckSize,
				})
			);

			this.context.room.duel?.stdin.write(`CMD:FIELD|${this.context.client.position}\n`);

			return;
		}
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
