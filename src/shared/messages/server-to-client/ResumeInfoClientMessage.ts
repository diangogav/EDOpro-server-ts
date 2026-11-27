/** STOC opcode of the data a device needs to draw a duel it resumed from another device. */
export const RESUME_INFO = 0xea;

export type ResumeInfo = {
	/** The room's ban list; the client picks its card database from it. Null when unknown. */
	readonly banListName: string | null;
	/** Games won in this match, from the resuming player's side. */
	readonly score: { readonly own: number; readonly opponent: number };
	/** The room runs the EDOPro core and its wire format is translated for this client. */
	readonly edoproRoom: boolean;
	/**
	 * The seat's deck while the room is side decking, so a device that never had
	 * it can open the side deck editor with the deck of this match. Null otherwise.
	 */
	readonly deck: {
		readonly main: number[];
		readonly extra: number[];
		readonly side: number[];
	} | null;
};

// Wire format: [2b size LE][0xea][JSON utf8]. Sent only to a socket that took its
// seat over by account, before the room's re-sync, so the board is drawn with the
// right cards and score.
export class ResumeInfoClientMessage {
	public static create(info: ResumeInfo): Buffer {
		const data = Buffer.concat([
			Buffer.from([RESUME_INFO]),
			Buffer.from(JSON.stringify(info), "utf8"),
		]);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);

		return Buffer.concat([size, data]);
	}
}
