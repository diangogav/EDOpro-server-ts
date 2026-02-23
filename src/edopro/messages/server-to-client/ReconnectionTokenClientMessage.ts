import { decimalToBytesBuffer } from "../../../utils";

export class ReconnectionTokenClientMessage {
	static create(token: string): Buffer {
		const type = Buffer.from([0xfd]);
		const tokenBuffer = Buffer.from(token, "utf8");
		const data = Buffer.concat([type, tokenBuffer]);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);

		return Buffer.concat([size, data]);
	}
}
