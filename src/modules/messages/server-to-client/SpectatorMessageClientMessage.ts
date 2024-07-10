import { decimalToBytesBuffer } from "../../../utils";
import { UTF8ToUTF16 } from "../../../utils/UTF8ToUTF16";
import { Team } from "../../room/domain/Team";

export class SpectatorMessageClientMessage {
	static create(senderName: string, message: Buffer): Buffer {
		const type = Buffer.from([0xf3]);
		const data = Buffer.concat([
			type,
			Buffer.from([0x00]),
			decimalToBytesBuffer(Team.SPECTATOR, 1),
			UTF8ToUTF16(senderName, 40),
			message,
		]);

		const size = decimalToBytesBuffer(data.length, 2);

		return Buffer.concat([size, data]);
	}
}
