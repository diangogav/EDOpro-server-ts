import { decimalToBytesBuffer } from "../../../utils";
import { UTF8ToUTF16 } from "../../../utils/UTF8ToUTF16";

export class MercuryPlayerInfoToCoreMessage {
	static create(name: string): Buffer {
		const type = Buffer.from([0x10]);
		const _name = UTF8ToUTF16(name, 40);
		const data = Buffer.concat([type, _name]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
