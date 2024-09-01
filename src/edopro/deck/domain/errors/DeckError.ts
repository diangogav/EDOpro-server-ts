import { decimalToBytesBuffer } from "../../../../utils";

export abstract class DeckError {
	protected readonly type: number;
	protected readonly code: number;
	protected readonly got: number;
	protected readonly min: number;
	protected readonly max: number;
	constructor({
		type,
		code = 0,
		got = 0,
		min = 0,
		max = 0,
	}: {
		type: number;
		code?: number;
		got?: number;
		min?: number;
		max?: number;
	}) {
		this.type = type;
		this.code = code;
		this.got = got;
		this.min = min;
		this.max = max;
	}

	buffer(): Buffer {
		const messageType = Buffer.from([0x02]);
		const data = Buffer.concat([
			messageType,
			Buffer.from([0x02]),
			Buffer.from([0xf5, 0x8b, 0x2e]),
			decimalToBytesBuffer(this.type, 4),
			decimalToBytesBuffer(this.got, 4),
			decimalToBytesBuffer(this.min, 4),
			decimalToBytesBuffer(this.max, 4),
			decimalToBytesBuffer(this.code, 4),
		]);

		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
