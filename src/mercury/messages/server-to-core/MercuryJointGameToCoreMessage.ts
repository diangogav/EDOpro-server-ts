import { mercuryConfig } from "../../../mercury/config";
import { decimalToBytesBuffer } from "../../../utils";
import { UTF8ToUTF16 } from "../../../utils/UTF8ToUTF16";

export class MercuryJointGameToCoreMessage {
	static create(password: string): Buffer {
		const type = Buffer.from([0x12]);
		const version = decimalToBytesBuffer(mercuryConfig.version, 2);
		const align = decimalToBytesBuffer(0, 2);
		const gameId = decimalToBytesBuffer(0, 4);
		const _password = UTF8ToUTF16(password, 40);
		const data = Buffer.concat([type, version, align, gameId, _password]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
