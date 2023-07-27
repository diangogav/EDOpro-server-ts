import { DeckCreator } from "../../../../deck/application/DeckCreator";
import { DuelState } from "../../../../room/domain/Room";
import { ChooseOrderClientMessage } from "../../../server-to-client/ChooseOrderClientMessage";
import { DuelStartClientMessage } from "../../../server-to-client/DuelStartClientMessage";
import { ErrorMessages } from "../../../server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../server-to-client/ErrorClientMessage";
import { SideDeckClientMessage } from "../../../server-to-client/game-messages/SideDeckClientMessage";
import { UpdateDeckMessageSizeCalculator } from "../../UpdateDeckMessageSizeCalculator";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";
import { NotReadyCommandStrategy } from "./NotReadyCommandStrategy";

export class UpdateDeckCommandStrategy implements RoomMessageHandlerCommandStrategy {
	constructor(
		private readonly context: RoomMessageHandlerContext,
		private readonly deckCreator: DeckCreator
	) {}

	async execute(): Promise<void> {
		const messageSize = new UpdateDeckMessageSizeCalculator(this.context.readBody()).calculate();
		const data = this.context.readBody();

		const body = data.subarray(0, messageSize);

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
			const deck = await this.deckCreator.build({
				main: mainDeck,
				side: sideDeck,
				banListHash: this.context.room.banlistHash,
			});

			const hasError = deck.validate();

			if (hasError) {
				this.context.client.sendMessage(hasError.buffer());

				new NotReadyCommandStrategy(this.context).execute();

				return;
			}
			//this.context.updatePreviousMessage(deck);
			this.context.client.setDeck(deck);
			//this.afterExecuteCallback();

			return;
		}

		const position = this.context.client.position;
		const player = this.context.client;
		if (!player.deck.isSideDeckValid(mainDeck)) {
			const message = ErrorClientMessage.create(ErrorMessages.SIDEERROR);
			this.context.client.sendMessage(message);

			return;
		}

		const deck = await this.deckCreator.build({
			main: mainDeck,
			side: sideDeck,
			banListHash: this.context.room.banlistHash,
		});

		this.context.room.setDecksToPlayer(position, deck);
		const message = DuelStartClientMessage.create();
		this.context.client.sendMessage(message);
		this.context.client.ready();

		if (this.context.client.isReconnecting) {
			this.context.client.sendMessage(DuelStartClientMessage.create());
			this.context.client.notReady();
			const message = SideDeckClientMessage.create();
			this.context.client.sendMessage(message);
			this.context.client.clearReconnecting();

			return;
		}

		this.startDuel();
	}

	private startDuel(): void {
		const allClientsNotReady = this.context.room.clients.some((client) => !client.isReady);
		if (allClientsNotReady) {
			return;
		}

		const message = ChooseOrderClientMessage.create();
		this.context.room.clientWhoChoosesTurn.sendMessage(message);
		this.context.room.choosingOrder();
	}
}
