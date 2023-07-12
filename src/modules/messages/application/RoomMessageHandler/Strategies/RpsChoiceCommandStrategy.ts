import { Choose, RockPaperScissor } from "../../../../rock-paper-scissor/RockPaperScissor";
import { ChooseOrderClientMessage } from "../../../server-to-client/ChooseOrderClientMessage";
import { RPSChooseClientMessage } from "../../../server-to-client/RPSChooseClientMessage";
import { RPSResultClientMessage } from "../../../server-to-client/RPSResultClientMessage";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";

export class RpsChoiceCommandStrategy implements RoomMessageHandlerCommandStrategy {
	constructor(private readonly context: RoomMessageHandlerContext) {}

	execute(): void {
		const NumberToChoose = {
			1: "SCISSOR",
			2: "ROCK",
			3: "PAPER",
		};

		const ChooseToNumber = {
			SCISSOR: 1,
			ROCK: 2,
			PAPER: 3,
		};

		const body = this.context.readBody(1).readInt8() as keyof typeof NumberToChoose;
		const choise = NumberToChoose[body] as Choose;
		const player = this.context.clients.find((client) => this.context.client === client);
		if (!player) {
			return;
		}
		player.setRpsChosen(choise);

		const players = this.context.clients.filter((client) => client.rpsChoise !== null);

		if (players.length < 2) {
			return;
		}

		const playerOne = players.find((player) => player.team === 0);
		const playerTwo = players.find((player) => player.team === 1);

		if (!playerOne?.rpsChoise || !playerTwo?.rpsChoise) {
			return;
		}

		const result = new RockPaperScissor().play(playerOne.rpsChoise, playerTwo.rpsChoise);

		const team0Response = RPSResultClientMessage.create({
			choise1: ChooseToNumber[playerOne.rpsChoise as keyof typeof ChooseToNumber],
			choise2: ChooseToNumber[playerTwo.rpsChoise as keyof typeof ChooseToNumber],
		});

		const team1Response = RPSResultClientMessage.create({
			choise1: ChooseToNumber[playerTwo.rpsChoise as keyof typeof ChooseToNumber],
			choise2: ChooseToNumber[playerOne.rpsChoise as keyof typeof ChooseToNumber],
		});

		this.context.room.clients.forEach((player) => {
			if (player.team === 0) {
				player.socket.write(team0Response);
			}
		});

		this.context.room.clients.forEach((player) => {
			if (player.team === 1) {
				player.socket.write(team1Response);
			}
		});

		this.context.room.spectators.forEach((spectator) => {
			spectator.socket.write(team0Response);
		});

		this.context.clients.forEach((client) => {
			client.clearRpsChoise();
		});

		if (result === "TIE") {
			const rpsChooseMessage = RPSChooseClientMessage.create();
			players.forEach((player) => {
				player.socket.write(rpsChooseMessage);
			});

			return;
		}

		const winner = result === "PLAYER_ONE_WINNER" ? players[0] : players[1];

		winner.socket.write(ChooseOrderClientMessage.create());
		this.context.room.setClientWhoChoosesTurn(winner);
		this.context.room.choosingOrder();
	}
}
