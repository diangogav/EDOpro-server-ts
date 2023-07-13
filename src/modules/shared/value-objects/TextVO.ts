export class TextVO {
	readonly value: string;

	constructor(text: Buffer) {
		// this.value = this.utf16ToUTF8(this.bufferToUTF16(text));
		this.value = this.readUntilNullTerminator(text);
	}

	private bufferToUTF16(buffer: Buffer): string {
		return buffer.toString("ucs2");
	}

	private utf16ToUTF8(utf16String: string): string {
		const buffer = Buffer.from(utf16String, "ucs2");

		return buffer.toString("utf8");
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
