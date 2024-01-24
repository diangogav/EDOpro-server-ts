import { decimalToBytesBuffer } from "../../../utils";
import { UTF8ToUTF16 } from "../../../utils/UTF8ToUTF16";

export class MercuryServerClientMessage {
	static create(message: string): Buffer {
		const type = Buffer.from([0x19]);
		const data = Buffer.concat([type, decimalToBytesBuffer(8, 1), UTF8ToUTF16(message, 512)]);

		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
