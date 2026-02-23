import { decimalToBytesBuffer } from "../../../utils";

export class CatchUpClientMessage {
	static create({ catchingUp }: { catchingUp: boolean }): Buffer {
		const type = Buffer.from([0xf0]);
		const data = Buffer.concat([type, Buffer.from([Number(catchingUp)])]);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);

		return Buffer.concat([size, data]);
	}
}
