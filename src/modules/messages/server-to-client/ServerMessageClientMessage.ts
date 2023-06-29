import { decimalToBytesBuffer } from "../../../utils";
import { UTF8ToUTF16 } from "../../../utils/UTF8ToUTF16";

export class ServerMessageClientMessage {
	static create(message: string): Buffer {
		const type = Buffer.from([0xf3]);
		const data = Buffer.concat([
			type,
			Buffer.from([0x02]),
			decimalToBytesBuffer(0, 1),
			Buffer.alloc(40),
			UTF8ToUTF16(message),
		]);

		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
