import { decimalToBytesBuffer } from "../../../utils";
import { UTF8ToUTF16 } from "../../../utils/UTF8ToUTF16";

export class PlayerEnterClientMessage {
	static create(name: string, position: number): Buffer {
		const type = Buffer.from([0x20]);
		const playerName = UTF8ToUTF16(name, 40);
		const pos = decimalToBytesBuffer(position, 2);
		const data = Buffer.concat([type, playerName, pos]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
