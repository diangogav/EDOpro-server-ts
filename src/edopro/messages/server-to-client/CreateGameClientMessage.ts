import { decimalToBytesBuffer } from "../../../utils/decimalToBytesBuffer";
import { Room } from "../../room/domain/Room";

export class CreateGameClientMessage {
	static create(room: Room): Buffer {
		const type = Buffer.from([0x11]);
		const stoId = decimalToBytesBuffer(room.id, 4);
		const data = Buffer.concat([type, stoId]);
		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
