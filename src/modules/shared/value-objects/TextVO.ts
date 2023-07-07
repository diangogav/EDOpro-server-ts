export class TextVO {
	readonly value: string;

	constructor(text: Buffer) {
		this.value = this.utf16ToUTF8(this.bufferToUTF16(text)).trim().replace(/\0/g, "");
	}

	private bufferToUTF16(buffer: Buffer): string {
		return buffer.toString("ucs2");
	}

	private utf16ToUTF8(utf16String: string): string {
		const buffer = Buffer.from(utf16String, "ucs2");

		return buffer.toString("utf8");
	}
}
