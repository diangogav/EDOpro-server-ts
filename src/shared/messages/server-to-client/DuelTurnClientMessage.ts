import { Commands } from "../Commands";

const MAX_TURN = 0xffff;

// STOC frame that tells a player who rejoined a duel by token which turn it is.
// Wire format: [2b size LE][0xee][turn u16 LE]. The game messages carry no turn
// number: a client counts the new-turn messages, and one that comes back has
// missed them.
export class DuelTurnClientMessage {
	static create(turn: number): Buffer {
		const data = Buffer.alloc(3);
		data[0] = Commands.DUEL_TURN;
		data.writeUInt16LE(Math.min(Math.max(turn, 0), MAX_TURN), 1);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);

		return Buffer.concat([size, data]);
	}
}
