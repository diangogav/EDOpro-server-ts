export class TextVO {
	readonly value: string;

	constructor(text: Buffer) {
		this.value = this.readUntilNullTerminator(text);
	}

	private readUntilNullTerminator(buffer: Buffer): string {
		let index = 0;
		while (index < buffer.length) {
			const charCode = buffer.readUInt16LE(index);
			if (charCode === 0) {
				break;
			}
			index += 2;
		}
		const utf16Buffer = buffer.slice(0, index);

		return utf16Buffer.toString();
	}
}
