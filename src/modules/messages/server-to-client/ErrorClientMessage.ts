import { decimalToBytesBuffer } from "../../../utils";
import { ErrorMessages } from "./error-messages/ErrorMessages";

export class ErrorClientMessage {
	static create(errorType: ErrorMessages): Buffer {
		const type = Buffer.from([0x02]);
		const message = decimalToBytesBuffer(errorType, 1);
		const code = decimalToBytesBuffer(0, 4);

		const data = Buffer.concat([type, message, code]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}

	static createDeckError({ type, code }: { type: number; code: number }): Buffer {
		const messageType = Buffer.from([0x02]);
		const got = 0;
		const min = 0;
		const max = 0;
		const data = Buffer.concat([
			messageType,
			Buffer.from([0x02]),
			Buffer.from([0xf5, 0x8b, 0x2e]),
			decimalToBytesBuffer(type, 4),
			decimalToBytesBuffer(got, 4),
			decimalToBytesBuffer(min, 4),
			decimalToBytesBuffer(max, 4),
			decimalToBytesBuffer(code, 4),
		]);

		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
