import { decimalToBytesBuffer } from "../../../utils";

export class MercuryPlayerChatMessage {
	static create(message: Buffer): Buffer {
		const type = Buffer.from([0x19]);
		const data = Buffer.concat([type, decimalToBytesBuffer(0x09, 2), message]);

		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
