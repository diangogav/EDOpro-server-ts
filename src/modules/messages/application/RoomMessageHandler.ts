import { Client } from "../../client/domain/Client";
import { Choose, RockPaperScissor } from "../../rock-paper-scissor/RockPaperScissor";
import { Commands } from "../domain/Commands";
import { Message } from "../Message";
import { ChooseOrderClientMessage } from "../server-to-client/ChooseOrderClientMessage";
import { DuelStartClientMessage } from "../server-to-client/DuelStartClientMessage";
import { PlayerChangeClientMessage } from "../server-to-client/PlayerChangeClientMessage";
import { RPSChooseClientMessage } from "../server-to-client/RPSChooseClientMessage";
import { RPSResultClientMessage } from "../server-to-client/RPSResultClientMessage";
import { UpdateDeckMessageSizeCalculator } from "./UpdateDeckMessageSizeCalculator";

export class RoomMessageHandler {
	private readonly HEADER_BYTES_LENGTH = 3;
	private data: Buffer;
	private readonly previousMessage: Message;
	private readonly client: Client;
	private readonly clients: Client[];

	constructor(data: Buffer, client: Client, clients: Client[]) {
		this.data = data;
		this.client = client;
		this.clients = clients;
	}

	read(): void {
		if (this.data.length === 0) {
			return;
		}
		const header = this.readHeader();
		const command = header.subarray(2, 3).readInt8();

		if (command === Commands.UPDATE_DECK) {
			const messageSize = new UpdateDeckMessageSizeCalculator(this.data).calculate();
			this.readBody(messageSize);
			this.read();
		}

		if (command === Commands.READY) {
			const status = this.client.position === 0 ? 0x09 : 0x19;
			const message = PlayerChangeClientMessage.create({ status });
			this.clients.forEach((client) => {
				client.socket.write(message);
			});
			this.read();
		}

		if (command === Commands.NOT_READY) {
			const status = this.client.position === 0 ? 0x0a : 0x1a;
			const message = PlayerChangeClientMessage.create({ status });
			this.clients.forEach((client) => {
				client.socket.write(message);
			});
			this.read();
		}

		if (command === Commands.TRY_START) {
			const duelStartMessage = DuelStartClientMessage.create();
			this.clients.forEach((client) => {
				client.socket.write(duelStartMessage);
			});

			const rpsChooseMessage = RPSChooseClientMessage.create();
			this.clients.forEach((client) => {
				client.socket.write(rpsChooseMessage);
			});
			this.read();
		}

		if (command === Commands.RPS_CHOICE) {
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

			const body = this.readBody(1).readInt8() as keyof typeof NumberToChoose;
			const choise = NumberToChoose[body] as Choose;
			const player = this.clients.find((client) => this.client === client);
			if (!player) {
				return;
			}
			player.setRpsChosen(choise);

			const players = this.clients.filter((client) => client.position >= 0 && client.position <= 1);
			const playerOne = players[0];
			const playerTwo = players[1];

			if (playerOne.rpsChoise === null || playerTwo.rpsChoise === null) {
				return;
			}

			const result = new RockPaperScissor().play(playerOne.rpsChoise, playerTwo.rpsChoise);
			players.forEach((player) => {
				const resultMessage = RPSResultClientMessage.create({
					choise1: ChooseToNumber[playerOne.rpsChoise as keyof typeof ChooseToNumber],
					choise2: ChooseToNumber[playerTwo.rpsChoise as keyof typeof ChooseToNumber],
				});
				player.socket.write(resultMessage);
				player.clearRpsChoise();
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
		}
	}

	private readHeader(): Buffer {
		const header = this.data.subarray(0, this.HEADER_BYTES_LENGTH);
		this.data = this.data.subarray(this.HEADER_BYTES_LENGTH, this.data.length);

		return header;
	}

	private readBody(maxBytesLength: number): Buffer {
		const body = this.data.subarray(0, maxBytesLength);
		this.data = this.data.subarray(maxBytesLength, this.data.length);

		return body;
	}
}
