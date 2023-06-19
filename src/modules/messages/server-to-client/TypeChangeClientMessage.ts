import { decimalToBytesBuffer } from "../../../utils";

export class TypeChangeClientMessage {
	static create({ type = 0x00 }: { type?: number }): Buffer {
		const messagType = Buffer.from([0x13]);
		const data = Buffer.concat([messagType, Buffer.from([type])]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
