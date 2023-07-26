import { DuelState } from "../../../../room/domain/Room";
import { ChooseOrderClientMessage } from "../../../server-to-client/ChooseOrderClientMessage";
import { DuelStartClientMessage } from "../../../server-to-client/DuelStartClientMessage";
import { StartDuelClientMessage } from "../../../server-to-client/game-messages/StartDuelClientMessage";
import { PlayerChangeClientMessage } from "../../../server-to-client/PlayerChangeClientMessage";
import { RPSChooseClientMessage } from "../../../server-to-client/RPSChooseClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class ReadyCommandStrategy implements RoomMessageHandlerCommandStrategy {
	private readonly STATUS = 0x09;

	constructor(
		private readonly context: RoomMessageHandlerContext // private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		if (this.context.client.isReconnecting && this.context.room.duelState === DuelState.DUELING) {
			this.context.client.sendMessage(DuelStartClientMessage.create());
			this.context.client.sendMessage(
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

		if (this.context.client.isReconnecting && this.context.room.duelState === DuelState.RPS) {
			this.context.client.sendMessage(DuelStartClientMessage.create());

			if (!this.context.client.rpsChoise) {
				const rpsChooseMessage = RPSChooseClientMessage.create();
				this.context.client.sendMessage(rpsChooseMessage);
			}

			this.context.client.clearReconnecting();

			return;
		}

		if (
			this.context.client.isReconnecting &&
			this.context.room.duelState === DuelState.CHOOSING_ORDER
		) {
			this.context.client.sendMessage(DuelStartClientMessage.create());

			if (this.context.room.clientWhoChoosesTurn.position === this.context.client.position) {
				const message = ChooseOrderClientMessage.create();
				this.context.room.clientWhoChoosesTurn.sendMessage(message);
			}

			this.context.client.clearReconnecting();

			return;
		}

		const status = (this.context.client.position << 4) | this.STATUS;
		const message = PlayerChangeClientMessage.create({ status });
		const deck = this.context.client.deck;
		this.context.room.setDecksToPlayer(this.context.client.position, deck);
		[...this.context.room.spectators, ...this.context.clients].forEach((client) => {
			client.sendMessage(message);
		});
		this.context.client.ready();
		// this.afterExecuteCallback();
	}
}
