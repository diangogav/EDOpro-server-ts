import { Commands } from "../Commands";

// STOC frame that tells a client of the YGOPro server the duel flags of the
// EDOPro room it sits in. Wire format: [2b size LE][0xed][low u32 LE][high u32 LE].
// A YGOPro host info has no field for them, and the client needs some of them
// to follow the duel: in a relay duel each team starts with its first duelist.
export class DuelFlagsClientMessage {
	public static create(flagsLow: number, flagsHigh: number): Buffer {
		const data = Buffer.alloc(9);
		data[0] = Commands.DUEL_FLAGS;
		data.writeUInt32LE(flagsLow >>> 0, 1);
		data.writeUInt32LE(flagsHigh >>> 0, 5);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);

		return Buffer.concat([size, data]);
	}
}
