import { PlayerData } from "src/shared/player/domain/PlayerData";
import { Team } from "src/shared/room/Team";

export type Player = {
	id: string;
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
		ips: { name: string; ipAddress: string | null }[] = []
	): void {
		this._players.forEach((player) => {
			const ipAddress = ips.find((data) => data.name === player.name)?.ipAddress ?? null;

			if (player.team === winner) {
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
