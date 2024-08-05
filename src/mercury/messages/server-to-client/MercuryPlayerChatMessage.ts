import { UTF8ToUTF16 } from "src/utils/UTF8ToUTF16";

import { decimalToBytesBuffer } from "../../../utils";

export class MercuryPlayerChatMessage {
	static create(message: string): Buffer {
		const type = Buffer.from([0x19]);
		const data = Buffer.concat([type, decimalToBytesBuffer(0x09, 2), UTF8ToUTF16(message, 512)]);

		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
