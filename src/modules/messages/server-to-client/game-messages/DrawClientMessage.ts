import { decimalToBytesBuffer } from "../../../../utils";

export class DrawClientMessage {
	static create({ buffer }: { buffer: Buffer }): Buffer {
		const header = Buffer.from([0x01]);
		const size = decimalToBytesBuffer(buffer.length + 1, 2);

		return Buffer.concat([size, header, buffer]);
	}
}
