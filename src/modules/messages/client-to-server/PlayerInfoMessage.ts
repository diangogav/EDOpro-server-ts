import { BufferToUTF16 } from "../../../utils/BufferToUTF16";
import { Message } from "../Message";

export class PlayerInfoMessage implements Message {
	public static readonly MAX_BYTES_LENGTH: number = 40;
	public readonly name: string;

	constructor(buffer: Buffer, length: number) {
		this.name = BufferToUTF16(buffer, length);
	}
}
