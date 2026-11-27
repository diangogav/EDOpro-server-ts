/** STOC opcode of the data a device needs to draw a duel it resumed from another device. */
export const RESUME_INFO = 0xea;

export type ResumeInfo = {
	/** The room's ban list; the client picks its card database from it. Null when unknown. */
	readonly banListName: string | null;
	/** Games won in this match, from the resuming player's side. */
	readonly score: { readonly own: number; readonly opponent: number };
	/** The room runs the EDOPro core and its wire format is translated for this client. */
	readonly edoproRoom: boolean;
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
