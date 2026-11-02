export class UpdateDeckMessageParser {
	private readonly buffer: Buffer;
	private readonly BYTES_PER_CARD = 4;
	private readonly MAIN_AND_EXTRA_DECK_BYTES_SIZE = 8;

	constructor(buffer: Buffer) {
		this.buffer = buffer;
	}

	getDeck(): [number[], number[]] {
		const messageSize = this.calculate();
		const body = this.buffer.subarray(0, messageSize);
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

		return [mainDeck, sideDeck];
	}

	private calculate(): number {
		const mainAndExtraSize = this.buffer.readUInt32LE(0);
		const sideSize = this.buffer.readUInt32LE(4);

		return (
			(mainAndExtraSize + sideSize) * this.BYTES_PER_CARD + this.MAIN_AND_EXTRA_DECK_BYTES_SIZE
		);
	}
}
