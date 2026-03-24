import { BufferToUTF16 } from "../../../utils/BufferToUTF16";
import { Message } from "../Message";

export class PlayerInfoMessage implements Message {
	public static readonly MAX_BYTES_LENGTH: number = 40;
	public readonly name: string;
	public readonly password: string | null;

	constructor(buffer: Buffer, length: number) {
		const data = BufferToUTF16(buffer, length);
		const separatorIndex = data.indexOf(":");

		if (separatorIndex === -1) {
			this.name = data;
			this.password = null;

			return;
		}

		this.name = data.slice(0, separatorIndex);
		const password = data.slice(separatorIndex + 1, separatorIndex + 5);
		this.password = password || null;
	}
}
