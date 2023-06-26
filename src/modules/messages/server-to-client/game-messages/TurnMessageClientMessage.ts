import { decimalToBytesBuffer } from "../../../../utils";

export class TurnClientMessage {
	static create(turn: number): Buffer {
		const header = Buffer.from([0x01]);
		const type = Buffer.from([0x28]);
		const data = Buffer.concat([type, decimalToBytesBuffer(turn, 1)]);
		const size = decimalToBytesBuffer(1 + data.length, 2);

		return Buffer.concat([size, header, data]);
	}
}
