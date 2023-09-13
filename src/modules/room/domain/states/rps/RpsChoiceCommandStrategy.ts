import { Client } from "../../../../client/domain/Client";
import { ClientMessage } from "../../../../messages/MessageProcessor";
import { ChooseOrderClientMessage } from "../../../../messages/server-to-client/ChooseOrderClientMessage";
import { RPSChooseClientMessage } from "../../../../messages/server-to-client/RPSChooseClientMessage";
import { RPSResultClientMessage } from "../../../../messages/server-to-client/RPSResultClientMessage";
import { Choose, RockPaperScissor } from "../../../../rock-paper-scissor/RockPaperScissor";
import { Room } from "../../Room";

export class RpsChoiceCommandStrategy {
	execute(message: ClientMessage, room: Room, client: Client): void {
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

		const body = message.data.readInt8() as keyof typeof NumberToChoose;
		const choise = NumberToChoose[body] as Choose;
		const player = room.clients.find((_client) => _client === client);
		if (!player) {
			return;
		}
		player.setRpsChosen(choise);

		const players = room.clients.filter((client) => client.rpsChoise !== null);

		if (players.length < 2) {
			return;
		}

		const playerOne = players.find((player) => player.team === 0 && player.inTurn);
		const playerTwo = players.find((player) => player.team === 1 && player.inTurn);

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

		room.clients.forEach((player) => {
			if (player.team === 0) {
				player.sendMessage(team0Response);
			}
		});

		room.clients.forEach((player) => {
			if (player.team === 1) {
				player.sendMessage(team1Response);
			}
		});

		room.spectators.forEach((spectator) => {
			spectator.sendMessage(team0Response);
		});

		room.clients.forEach((client) => {
			client.clearRpsChoise();
		});

		if (result === "TIE") {
			const rpsChooseMessage = RPSChooseClientMessage.create();
			players.forEach((player) => {
				player.sendMessage(rpsChooseMessage);
			});

			return;
		}

		const player0Turn = room.clients.find(
			(_client) => _client.position % room.team0 === 0 && _client.team === 0
		);

		const player1Turn = room.clients.find(
			(_client) => _client.position % room.team1 === 0 && _client.team === 1
		);

		if (!player0Turn || !player1Turn) {
			return;
		}

		const winner = result === "PLAYER_ONE_WINNER" ? player0Turn : player1Turn;

		winner.sendMessage(ChooseOrderClientMessage.create());
		room.setClientWhoChoosesTurn(winner);
		room.choosingOrder();
	}
}
