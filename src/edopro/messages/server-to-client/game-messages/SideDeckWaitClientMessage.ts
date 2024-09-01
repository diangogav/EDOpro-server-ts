import { decimalToBytesBuffer } from "../../../../utils";

export class SideDeckWaitClientMessage {
	static create(): Buffer {
		const header = Buffer.from([0x08]);
		const data = Buffer.concat([header]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
