import { decimalToBytesBuffer } from "../../../../utils";

export class TimeLimitClientMessage {
	static create({ team, timeLimit }: { team: number; timeLimit: number }): Buffer {
		const header = Buffer.from([0x18]);
		const data = Buffer.concat([decimalToBytesBuffer(team, 1), decimalToBytesBuffer(timeLimit, 2)]);
		const size = decimalToBytesBuffer(data.length + 1, 2);

		return Buffer.concat([size, header, data]);
	}
}
