import { Deck } from "../../../../deck/domain/Deck";
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
		const deck = new Deck({ main: mainDeck, side: sideDeck });
		this.context.updatePreviousMessage(deck);
		this.afterExecuteCallback();
	}
}
