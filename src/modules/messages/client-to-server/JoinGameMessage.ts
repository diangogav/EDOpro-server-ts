import { TextVO } from "../../shared/value-objects/TextVO";
import { Message } from "../Message";

export class JoinGameMessage implements Message {
	public static readonly MAX_BYTES_LENGTH: number = 50;

	public readonly version2: number;
	public readonly id: number;
	public readonly password: string;
	public readonly clientVersion: number;

	constructor(buffer: Buffer) {
		this.version2 = buffer.subarray(0, 2).readUInt16LE();
		this.id = buffer.subarray(4, 8).readUint32LE();
		this.password = new TextVO(buffer.subarray(8, 48)).value;
		this.clientVersion = buffer.subarray(46, 50).readUInt32LE();
	}
}
