import { decimalToBytesBuffer } from "../../../utils";

export class PlayerChangeClientMessage {
	static create({ status = 0x09 }: { status?: number }): Buffer {
		const type = Buffer.from([0x21]);
		const playerStatus = Buffer.from([status]);
		const data = Buffer.concat([type, playerStatus]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
