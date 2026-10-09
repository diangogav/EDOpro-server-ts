/**
 * Length of the run of wins at the head of a list of match outcomes ordered
 * from the most recent match to the oldest.
 */
export function currentStreak(winnersLatestFirst: boolean[]): number {
	const firstLoss = winnersLatestFirst.indexOf(false);

	return firstLoss === -1 ? winnersLatestFirst.length : firstLoss;
}
