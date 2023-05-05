import { RuleNotFoundError } from "./RuleNotFoundError";

export type Choose = "PAPER" | "ROCK" | "SCISSOR";

export type Result = "PLAYER_ONE_WINNER" | "PLAYER_TWO_WINNER" | "TIE";

export class RockPaperScissor {
	private readonly RULES = new Map<`${Choose}vs${Choose}`, Result>([
		["PAPERvsROCK", "PLAYER_ONE_WINNER"],
		["PAPERvsSCISSOR", "PLAYER_TWO_WINNER"],
		["PAPERvsPAPER", "TIE"],

		["ROCKvsSCISSOR", "PLAYER_ONE_WINNER"],
		["ROCKvsPAPER", "PLAYER_TWO_WINNER"],
		["ROCKvsROCK", "TIE"],

		["SCISSORvsPAPER", "PLAYER_ONE_WINNER"],
		["SCISSORvsROCK", "PLAYER_TWO_WINNER"],
		["SCISSORvsSCISSOR", "TIE"]
	]);

	play(playerOneChoose: Choose, playerTwoChoose: Choose): Result {
		const winner = this.RULES.get(`${playerOneChoose}vs${playerTwoChoose}`);

		if (!winner) {
			throw new RuleNotFoundError();
		}

		return winner;
	}
}
