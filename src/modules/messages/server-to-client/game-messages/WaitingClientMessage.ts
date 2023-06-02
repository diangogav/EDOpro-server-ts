import { decimalToBytesBuffer } from "../../../../utils";

export class WaitingClientMessage {
	static create(): Buffer {
		const header = Buffer.from([0x01]);
		const type = Buffer.from([0x03]);
		const data = Buffer.concat([type]);
		const size = decimalToBytesBuffer(1 + data.length, 2);

		return Buffer.concat([size, header, data]);
	}
}
