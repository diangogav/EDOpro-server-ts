import { decimalToBytesBuffer } from "../../../../utils";

export class UpdateCardClientMessage {
	static create({
		deckLocation,
		con,
		sequence,
		buffer,
	}: {
		deckLocation: number;
		con: number;
		sequence: number;
		buffer: Buffer;
	}): Buffer {
		const header = Buffer.from([0x01]);
		const type = Buffer.from([0x07]);
		const data = Buffer.concat([
			type,
			decimalToBytesBuffer(con, 1),
			decimalToBytesBuffer(deckLocation, 1),
			decimalToBytesBuffer(sequence, 1),
			buffer,
		]);
		const size = decimalToBytesBuffer(1 + data.length, 2);

		return Buffer.concat([size, header, data]);
	}
}
