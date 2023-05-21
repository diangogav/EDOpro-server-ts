import { decimalToBytesBuffer } from "../../../../utils";

export class UpdateDataClientMessage {
	static create({
		deckLocation,
		team,
		buffer,
	}: {
		deckLocation: number;
		team: number;
		buffer: Buffer;
	}): Buffer {
		const header = Buffer.from([0x08, 0x00, 0x01]);
		const type = Buffer.from([0x06]);

		return Buffer.concat([
			header,
			type,
			decimalToBytesBuffer(team, 1),
			decimalToBytesBuffer(deckLocation, 1),
			buffer,
		]);
	}
}
