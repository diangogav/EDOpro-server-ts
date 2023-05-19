import { decimalToBytesBuffer } from "../../../../utils";

export class StartDuelClientMessage {
	static create({
		lp,
    team,
		playerMainDeckSize,
		playerExtraDeckSize,
		opponentMainDeckSize,
		opponentExtraDeckSize,
	}: {
		lp: number;
    team: number;
		playerExtraDeckSize: number;
		playerMainDeckSize: number;
		opponentMainDeckSize: number;
		opponentExtraDeckSize: number;
	}): Buffer {
		const header = Buffer.from([0x13, 0x00, 0x01]);
		const type = Buffer.from([0x04]);

		return Buffer.concat([
			header,
			type,
			decimalToBytesBuffer(team, 1),
			decimalToBytesBuffer(lp, 4),
			decimalToBytesBuffer(lp, 4),
			decimalToBytesBuffer(playerMainDeckSize, 2),
			decimalToBytesBuffer(playerExtraDeckSize, 2),
			decimalToBytesBuffer(opponentMainDeckSize, 2),
			decimalToBytesBuffer(opponentExtraDeckSize, 2),
		]);
	}
}
