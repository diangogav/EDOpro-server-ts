import { decimalToBytesBuffer } from "../../../utils";
import { ErrorMessages } from "./error-messages/ErrorMessages";

export class VersionErrorClientMessage {
	static create(version: number): Buffer {
		const type = Buffer.from([0x02]);
		const message = decimalToBytesBuffer(ErrorMessages.VERERROR, 1);
		const code = decimalToBytesBuffer(0, 3);
		const _version = decimalToBytesBuffer(version, 4);
		const data = Buffer.concat([type, message, code, _version]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
