import { decimalToBytesBuffer } from "../../../utils";

export class ReplayBufferMessage {
	static create(replay: Buffer): Buffer {
		const header = Buffer.from([0x30]);
		const size = decimalToBytesBuffer(replay.length + 1, 2);

		return Buffer.concat([size, header, replay]);
	}
}
