import { decimalToBytesBuffer } from "../../../utils";

export class ErrorClientMessage {
	static create(): Buffer {
		const type = Buffer.from([0x02]);
		const message = decimalToBytesBuffer(3, 1);
		const code = decimalToBytesBuffer(0, 4);

		const data = Buffer.concat([type, message, code]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
