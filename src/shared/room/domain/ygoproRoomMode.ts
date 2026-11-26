const MODE_SINGLE = 0;
const MODE_MATCH = 1;
const MODE_TAG = 2;

/**
 * The room as a YGOPro lobby reads it, in one `mode`: single duel, match or
 * tag. EDOPro leaves that byte at 0 and says the same with the team sizes and
 * a "best of" count, so a best-of-three room copied byte for byte reads as a
 * single duel.
 */
export function ygoproRoomMode(team0: number, team1: number, bestOf: number): number {
	if (team0 > 1 || team1 > 1) return MODE_TAG;

	return bestOf > 1 ? MODE_MATCH : MODE_SINGLE;
}
