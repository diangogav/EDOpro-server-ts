export class UpdateDeckMessageSizeCalculator {
	private readonly buffer: Buffer;
	private readonly BYTES_PER_CARD = 4;
	private readonly MAIN_AND_EXTRA_DECK_BYTES_SIZE = 8;

	constructor(buffer: Buffer) {
		this.buffer = buffer;
	}

	calculate(): number {
		const mainAndExtraSize = this.buffer.readUInt32LE(0);
		const sideSize = this.buffer.readUInt32LE(4);

		return (
			(mainAndExtraSize + sideSize) * this.BYTES_PER_CARD + this.MAIN_AND_EXTRA_DECK_BYTES_SIZE
		);
	}
}
