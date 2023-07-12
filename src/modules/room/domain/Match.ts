export class Match {
	private playerScore = 0;
	private opponentScore = 0;
	private readonly bestOf: number;
	private readonly needWins: number;

	constructor({ bestOf }: { bestOf: number }) {
		this.bestOf = bestOf;
		this.needWins = Math.ceil(this.bestOf / 2);
	}

	duelWinner(winner: number): void {
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
}
