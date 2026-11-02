import { Client } from "../../client/domain/Client";

export type TurnOrderRules = {
	/** Seats per team. */
	team0: number;
	team1: number;
	/** Relay duels keep seat order for both teams. */
	isRelay: boolean;
	/** The team that plays first (0 or 1). */
	firstToPlay: number;
};

function teamBySeat(players: Client[], team: number): Client[] {
	return players.filter((p) => p.team === team).sort((a, b) => a.position - b.position);
}

/**
 * Assigns each player a duel position and gives the turn to duel position 0 of
 * each team. Outside relay duels, the team that plays second is rotated by one
 * seat.
 */
export function prepareTurnOrder(players: Client[], rules: TurnOrderRules): void {
	const team0Players = teamBySeat(players, 0);
	const team1Players = teamBySeat(players, 1);

	const offset0 = rules.isRelay ? 0 : rules.firstToPlay === 1 ? 1 : 0;
	const offset1 = rules.isRelay ? 0 : rules.firstToPlay === 0 ? 1 : 0;

	team0Players.forEach((p, idx) => {
		p.clearTurn();
		p.setDuelPosition((idx + offset0) % rules.team0);
	});

	team1Players.forEach((p, idx) => {
		p.clearTurn();
		p.setDuelPosition((idx + offset1) % rules.team1);
	});

	team0Players.find((p) => p.duelPosition === 0)?.turn();
	team1Players.find((p) => p.duelPosition === 0)?.turn();
}

/** Passes the team's turn to its next duel position, wrapping around. */
export function nextTurn(players: Client[], team: number): void {
	const teamPlayers = players
		.filter((p) => p.team === team)
		.sort((a, b) => a.duelPosition - b.duelPosition);

	if (teamPlayers.length === 0) return;

	const currentIdx = teamPlayers.findIndex((p) => p.inTurn);
	if (currentIdx === -1) return;

	const nextIdx = (currentIdx + 1) % teamPlayers.length;

	teamPlayers[currentIdx].clearTurn();
	teamPlayers[nextIdx].turn();
}
