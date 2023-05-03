import { decimalToBytesBuffer } from "../../../utils";

export class PlayerEnterClientMessage {
	static create(name: string, position: number): Buffer {
		const header = Buffer.from([0x2b, 0x00, 0x20]);
		const playerName = Buffer.from(name, "utf-8");
		const pos = decimalToBytesBuffer(position, 2);

		return Buffer.concat([header, playerName, pos]);
	}
}
