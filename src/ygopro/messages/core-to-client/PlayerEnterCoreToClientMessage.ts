import { BufferToUTF16 } from "../../../utils/BufferToUTF16";

export class PlayerEnterMessage {
	public readonly name: string;
	public readonly position: number;

	constructor(buffer: Buffer) {
		this.name = BufferToUTF16(buffer, 40);
		this.position = buffer.subarray(40, 42).readInt8();
	}
}
