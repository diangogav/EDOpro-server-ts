import { decimalToBytesBuffer } from "../../../utils";

export class WatchChangeClientMessage {
	static create({ count }: { count: number }): Buffer {
		const messagType = Buffer.from([0x22]);
		const data = Buffer.concat([messagType, decimalToBytesBuffer(count, 2)]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
