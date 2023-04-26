import { decimalToBytesBuffer } from "../../../utils/decimalToBytesBuffer";
import { Room } from "../../room/domain/Room";

export class CreateGameClientMessage {
	static create(room: Room): Buffer {
		const header = Buffer.from([0x05, 0x00, 0x11]);
		const stoId = decimalToBytesBuffer(room.id, 4);

		return Buffer.concat([header, stoId]);
	}
}
