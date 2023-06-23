import { decimalToBytesBuffer } from "../../../utils";

export class CatchUpClientMessage {
	static create({ catchingUp }: { catchingUp: boolean }): Buffer {
		const type = Buffer.from([0xf0]);
		const data = Buffer.concat([type, decimalToBytesBuffer(Number(catchingUp), 1)]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
