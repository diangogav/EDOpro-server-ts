import { decimalToBytesBuffer } from "../../../utils";

export class PlayerEnterClientMessage {
	static create(name: string, position: number): Buffer {
		const type = Buffer.from([0x20]);
		const playerName = Buffer.from(name, "utf-8");
		const pos = decimalToBytesBuffer(position, 2);
		const data = Buffer.concat([type, playerName, pos]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
