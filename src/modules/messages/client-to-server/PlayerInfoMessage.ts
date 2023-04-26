import { Message } from "../Message";

export class PlayerInfoMessage implements Message {
	public readonly header: Buffer;
	public readonly name: string;

	constructor(buffer: Buffer) {
		this.header = buffer.subarray(0, 3);
		this.name = buffer.subarray(3, 43).toString();
	}
}
