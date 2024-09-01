import { decimalToBytesBuffer } from "../../../utils";

export class RPSResultClientMessage {
	static create({ choise1, choise2 }: { choise1: number; choise2: number }): Buffer {
		const header = Buffer.from([0x03, 0x00, 0x05]);

		return Buffer.concat([
			header,
			decimalToBytesBuffer(choise1, 1),
			decimalToBytesBuffer(choise2, 1),
		]);
	}
}
