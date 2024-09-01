import { BufferToUTF16 } from "../../../utils/BufferToUTF16";
import { Message } from "../Message";

export class PlayerInfoMessage implements Message {
	public static readonly MAX_BYTES_LENGTH: number = 40;
	public readonly name: string;
	public readonly password: string | null;

	constructor(buffer: Buffer, length: number) {
		const data = BufferToUTF16(buffer, length);
		const [username, password] = data.split(":");
		this.name = username;
		this.password = password || null;
	}
}
