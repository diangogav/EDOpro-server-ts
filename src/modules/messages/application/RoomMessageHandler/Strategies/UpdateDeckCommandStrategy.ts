import { Deck } from "../../../../deck/domain/Deck";
import { DuelState } from "../../../../room/domain/Room";
import { ChooseOrderClientMessage } from "../../../server-to-client/ChooseOrderClientMessage";
import { DuelStartClientMessage } from "../../../server-to-client/DuelStartClientMessage";
import { ErrorClientMessage } from "../../../server-to-client/ErrorClientMessage";
import { UpdateDeckMessageSizeCalculator } from "../../UpdateDeckMessageSizeCalculator";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class UpdateDeckCommandStrategy implements RoomMessageHandlerCommandStrategy {
	constructor(
		private readonly context: RoomMessageHandlerContext,
		private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const messageSize = new UpdateDeckMessageSizeCalculator(this.context.data).calculate();
		const body = this.context.readBody(messageSize);
		const mainAndExtraDeckSize = body.readUInt32LE(0);
		const sizeDeckSize = body.readUint32LE(4);

		const mainDeck: number[] = [];
		for (let i = 8; i < mainAndExtraDeckSize * 4 + 8; i += 4) {
			const code = body.readUint32LE(i);
			mainDeck.push(code);
		}

		const sideDeck: number[] = [];
		for (
			let i = mainAndExtraDeckSize * 4 + 8;
			i < (mainAndExtraDeckSize + sizeDeckSize) * 4 + 8;
			i += 4
		) {
			const code = body.readUint32LE(i);
			sideDeck.push(code);
		}

		if (this.context.room.duelState !== DuelState.SIDE_DECKING) {
			const deck = new Deck({ main: mainDeck, side: sideDeck });
			this.context.updatePreviousMessage(deck);
			this.afterExecuteCallback();

			return;
		}

		const position = this.context.client.position;
		const player = this.context.client;
		if (!player.deck.isSideDeckValid(mainDeck)) {
			const message = ErrorClientMessage.create();
			this.context.client.socket.write(message);

			return;
		}
		const deck = new Deck({ main: mainDeck, side: sideDeck });
		this.context.room.setDecksToPlayer(position, deck);
		const message = DuelStartClientMessage.create();
		this.context.client.socket.write(message);
		this.context.client.ready();
		this.startDuel();
	}

	private startDuel(): void {
		const allClientsNotReady = this.context.clients.some((client) => !client.isReady);
		if (allClientsNotReady) {
			return;
		}

		const message = ChooseOrderClientMessage.create();
		this.context.room.clientWhoChoosesTurn.socket.write(message);
	}
}
