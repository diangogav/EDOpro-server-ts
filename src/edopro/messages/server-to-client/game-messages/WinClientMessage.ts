import { decimalToBytesBuffer } from "../../../../utils";

export class WinClientMessage {
	static create({ reason, winner }: { reason: number; winner: number }): Buffer {
		const header = Buffer.from([0x01]);
		const type = Buffer.from([0x05]);
		const data = Buffer.concat([
			type,
			decimalToBytesBuffer(winner, 1),
			decimalToBytesBuffer(reason, 1),
		]);
		const size = decimalToBytesBuffer(data.length + 1, 2);

		return Buffer.concat([size, header, data]);
	}
}
