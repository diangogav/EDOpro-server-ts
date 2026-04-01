import { Message } from "../../edopro/messages/Message";
import { TextVO } from "../../shared/value-objects/TextVO";

export class MercuryJoinGameMessage implements Message {
	public readonly version: number;
	public readonly align: number;
	public readonly gameId: number;
	public readonly pass: string;

	constructor(buffer: Buffer) {
		this.version = buffer.subarray(0, 2).readUInt16LE();
		this.align = buffer.subarray(2, 4).readUint16LE();
		this.gameId = buffer.subarray(4, 8).readUInt32LE();
		this.pass = Buffer.from(new TextVO(buffer.subarray(8, 48)).value).toString("utf16le");
	}
}
