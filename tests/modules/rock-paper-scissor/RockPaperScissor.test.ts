import {
	Choose,
	Result,
	RockPaperScissor
} from "../../../src/modules/rock-paper-scissor/RockPaperScissor";
import { RuleNotFoundError } from "../../../src/modules/rock-paper-scissor/RuleNotFoundError";

describe("<RockPaperScissor>", () => {
	let SUT: RockPaperScissor;

	beforeEach(() => {
		SUT = new RockPaperScissor();
	});

	it("should throw an exception if chooses are invalid", () => {
		const playerOneChoose = "BAD_CHOOSE" as Choose;
		const playerTwoChoose: Choose = "SCISSOR";

		expect(() => SUT.play(playerOneChoose, playerTwoChoose)).toThrow(RuleNotFoundError);
	});

	it("Rock Vs. Scissor => win player one", () => {
		const playerOneChoose: Choose = "ROCK";
		const playerTwoChoose: Choose = "SCISSOR";
		const result: Result = "PLAYER_ONE_WINNER";

		expect(SUT.play(playerOneChoose, playerTwoChoose)).toBe(result);
	});

	it("Rock Vs. Paper => win player two", () => {
		const playerOneChoose: Choose = "ROCK";
		const playerTwoChoose: Choose = "PAPER";
		const result: Result = "PLAYER_TWO_WINNER";

		expect(SUT.play(playerOneChoose, playerTwoChoose)).toBe(result);
	});

	it("Rock Vs. Rock => tie", () => {
		const playerOneChoose: Choose = "ROCK";
		const playerTwoChoose: Choose = "ROCK";
		const result: Result = "TIE";

		expect(SUT.play(playerOneChoose, playerTwoChoose)).toBe(result);
	});

	it("Paper Vs. Scissor => win player two", () => {
		const playerOneChoose: Choose = "PAPER";
		const playerTwoChoose: Choose = "SCISSOR";
		const result: Result = "PLAYER_TWO_WINNER";

		expect(SUT.play(playerOneChoose, playerTwoChoose)).toBe(result);
	});

	it("Paper Vs. Rock => win player one", () => {
		const playerOneChoose: Choose = "PAPER";
		const playerTwoChoose: Choose = "ROCK";
		const result: Result = "PLAYER_ONE_WINNER";

		expect(SUT.play(playerOneChoose, playerTwoChoose)).toBe(result);
	});

	it("Paper Vs. Paper => tie", () => {
		const playerOneChoose: Choose = "PAPER";
		const playerTwoChoose: Choose = "PAPER";
		const result: Result = "TIE";

		expect(SUT.play(playerOneChoose, playerTwoChoose)).toBe(result);
	});

	it("Scissor Vs. Scissor => tie ", () => {
		const playerOneChoose: Choose = "SCISSOR";
		const playerTwoChoose: Choose = "SCISSOR";
		const result: Result = "TIE";

		expect(SUT.play(playerOneChoose, playerTwoChoose)).toBe(result);
	});

	it("Scissor Vs. Paper => win player one", () => {
		const playerOneChoose: Choose = "SCISSOR";
		const playerTwoChoose: Choose = "PAPER";
		const result: Result = "PLAYER_ONE_WINNER";

		expect(SUT.play(playerOneChoose, playerTwoChoose)).toBe(result);
	});

	it("Scissor Vs. Rock => win player two", () => {
		const playerOneChoose: Choose = "SCISSOR";
		const playerTwoChoose: Choose = "ROCK";
		const result: Result = "PLAYER_TWO_WINNER";

		expect(SUT.play(playerOneChoose, playerTwoChoose)).toBe(result);
	});
});
