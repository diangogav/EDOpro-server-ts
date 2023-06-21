export class Match {
	private playerScore = 0;
	private opponentScore = 0;
	private readonly bestOf: number;

	constructor({ bestOf }: { bestOf: number }) {
		this.bestOf = bestOf;
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
		return this.playerScore + this.opponentScore >= this.bestOf;
	}
}
