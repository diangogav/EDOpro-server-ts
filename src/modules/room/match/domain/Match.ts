import { Deck } from "../../../deck/domain/Deck";

export type Player = {
	name: string;
	deck: Deck;
	team: number;
};

export type MatchHistory = {
	games: {
		result: "winner" | "loser" | "deuce";
		score: number;
	}[];
};

export class Match {
	private playerScore = 0;
	private opponentScore = 0;
	private readonly bestOf: number;
	private readonly needWins: number;
	private _players: (Player & MatchHistory)[] = [];

	constructor({ bestOf }: { bestOf: number }) {
		this.bestOf = bestOf;
		this.needWins = Math.ceil(this.bestOf / 2);
	}

	initializeHistoricalData(players: Player[]): void {
		this._players = players.map((player) => ({
			...player,
			games: [],
		}));
	}

	duelWinner(winner: number): void {
		this._players.forEach((player) => {
			if (player.team === winner) {
				player.games.push({
					result: "winner",
					score: 1,
				});
			} else {
				player.games.push({
					result: "loser",
					score: 0,
				});
			}
		});

		if (this.isFinished()) {
			return;
		}

		if (winner === 0) {
			this.playerScore++;

			return;
		}

		this.opponentScore++;
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

	get playersHistory(): (Player & MatchHistory)[] {
		return this._players;
	}
}
