import { BufferToUTF16 } from "../../../utils/BufferToUTF16";
import { Message } from "../Message";

export class PlayerInfoMessage implements Message {
	public static readonly MAX_BYTES_LENGTH: number = 40;
	public readonly name: string;
	public readonly password: string | null;
	public readonly hasMercurySignature: boolean;

	constructor(buffer: Buffer, length: number) {
		const data = BufferToUTF16(buffer, length);
		this.hasMercurySignature = data.includes("$");
		const separatorIndex = data.indexOf(":");

		if (separatorIndex === -1) {
			this.name = this.removeUnexpectedSuffix(data);
			this.password = null;

			return;
		}

		this.name = this.removeUnexpectedSuffix(data.slice(0, separatorIndex));
		const password = data.slice(separatorIndex + 1, separatorIndex + 5);
		this.password = password || null;
	}

	private removeUnexpectedSuffix(value: string): string {
		return value.split("$", 1)[0];
	}
}
