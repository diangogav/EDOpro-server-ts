import { PlayerData } from "../../../../player/domain/PlayerData";
import { Team } from "../../../Team";

export type Player = {
	id: string | null;
	name: string;
	// deck: Deck;
	team: number;
};

export type MatchHistory = {
	games: {
		result: "winner" | "loser" | "deuce";
		turns: number;
		ipAddress: string | null;
		// score: number;
	}[];
};

export class Match {
	private playerScore = 0;
	private opponentScore = 0;
	private readonly bestOf: number;
	private readonly needWins: number;
	private _players: (Player & MatchHistory)[] = [];
	private readonly DRAW = 2;

	constructor({ bestOf }: { bestOf: number }) {
		this.bestOf = bestOf;
		this.needWins = Math.ceil(this.bestOf / 2);
		this.playerScore = 0;
		this.opponentScore = 0;
	}

	initializeHistoricalData(players: Player[]): void {
		this._players = players.map((player) => ({
			...player,
			games: [],
		}));
	}

	duelWinner(
		winner: number,
		turns: number,
		ips: { name: string; ipAddress: string | null }[],
	): void {
		this._players.forEach((player) => {
			const ipAddress = ips.find((data) => data.name === player.name)?.ipAddress ?? null;

			if (winner === this.DRAW) {
				player.games.push({
					result: "deuce",
					turns,
					ipAddress,
					// score: 1,
				});
			} else if (player.team === winner) {
				player.games.push({
					result: "winner",
					turns,
					ipAddress,
					// score: 1,
				});
			} else {
				player.games.push({
					result: "loser",
					turns,
					ipAddress,
					// score: 0,
				});
			}
		});

		if (this.isFinished()) {
			return;
		}

		if (winner === this.DRAW) {
			return;
		}

		if (winner === 0) {
			this.playerScore++;

			return;
		}

		this.opponentScore++;
	}

	/**
	 * Award every remaining game to `winnerTeam` because the other side walked
	 * away, and report how many it awarded.
	 *
	 * Each awarded game IS recorded, with zero turns to mark that it was never
	 * played. That is how a judge scores a no-show — the absent player loses the
	 * games they did not present for — and it is what keeps the numbers honest
	 * downstream: `Player.wins`/`losses`, the stored match score and the match
	 * points are all counted off these records, so an awarded game that left no
	 * record would pay the winner as if the match had been closer than it was.
	 */
	forfeit(winnerTeam: number, ips: { name: string; ipAddress: string | null }[]): number {
		let awarded = 0;

		// duelWinner moves the score on every call, so the match always reaches a
		// decision; bestOf bounds the loop anyway rather than trusting that.
		while (!this.isFinished() && awarded < this.bestOf) {
			this.duelWinner(winnerTeam, 0, ips);
			awarded++;
		}

		return awarded;
	}

	isFinished(): boolean {
		return this.opponentScore >= this.needWins || this.playerScore >= this.needWins;
	}

	get score(): { team0: number; team1: number } {
		return {
			team0: this.playerScore,
			team1: this.opponentScore,
		};
	}

	get playersHistory(): PlayerData[] {
		return this._players.map((player) => ({
			...player,
			winner: this.winner() === player.team,
			score: player.team === Team.PLAYER ? this.score.team0 : this.score.team1,
		}));
	}

	isFirstDuel(): boolean {
		return this.playerScore === 0 && this.opponentScore === 0;
	}

	private winner(): number {
		if (this.score.team0 > this.score.team1) {
			return 0;
		}

		return 1;
	}
}
