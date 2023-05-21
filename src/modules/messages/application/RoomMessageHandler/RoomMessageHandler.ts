import { spawn } from "child_process";

import { Client } from "../../../client/domain/Client";
import { Room } from "../../../room/domain/Room";
import { Commands } from "../../domain/Commands";
import { StartDuelClientMessage } from "../../server-to-client/game-messages/StartDuelClientMessage";
import { UpdateDataClientMessage } from "../../server-to-client/game-messages/UpdateDataClientMessage";
import { RoomMessageHandlerContext } from "./RoomMessageHandlerContext";
import { NotReadyCommandStrategy } from "./Strategies/NotReadyCommandStrategy";
import { ReadyCommandStrategy } from "./Strategies/ReadyCommandStrategy";
import { RpsChoiceCommandStrategy } from "./Strategies/RpsChoiceCommandStrategy";
import { TryStartCommandStrategy } from "./Strategies/TryStartCommandStrategy";
import { UpdateDeckCommandStrategy } from "./Strategies/UpdateDeckCommandStrategy";

export class RoomMessageHandler {
	private readonly context: RoomMessageHandlerContext;

	constructor(data: Buffer, client: Client, clients: Client[], room: Room) {
		this.context = new RoomMessageHandlerContext(data, client, clients, room);
	}

	read(): void {
		if (this.context.isDataEmpty()) {
			return;
		}
		const header = this.context.readHeader();
		const command = header.subarray(2, 3).readInt8();

		if (command === Commands.UPDATE_DECK) {
			this.context.setStrategy(new UpdateDeckCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.READY) {
			this.context.setStrategy(new ReadyCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.NOT_READY) {
			this.context.setStrategy(new NotReadyCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.TRY_START) {
			this.context.setStrategy(new TryStartCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.RPS_CHOICE) {
			this.context.setStrategy(new RpsChoiceCommandStrategy(this.context));
		}

		if (command === 4) {
			const core = spawn("/home/diango/code/edo-pro-server-ts/out", [
				this.context.room.startLp.toString(),
				this.context.room.startHand.toString(),
				this.context.room.drawCount.toString(),
				this.context.room.duelFlag.toString(),
				this.context.room.extraRules.toString(),
				JSON.stringify(this.context.room.users[0].deck?.main ?? []),
				JSON.stringify(this.context.room.users[0].deck?.side ?? []),
				JSON.stringify(this.context.room.users[1].deck?.main ?? []),
				JSON.stringify(this.context.room.users[1].deck?.side ?? []),
			]);

			core.stdout.on("data", (data: string) => {
				const message = data.toString().trim();
				const regex = /CMD:[A-Z]+(\|[a-zA-Z0-9]+)*\b/g;
				const commands = message.match(regex);

				if (!commands) {
					return;
				}

				commands.forEach((command) => {
					const commandParts = command.split("|");
					const cmd = commandParts[0];
					const params = commandParts.slice(1);

					if (cmd === "CMD:START") {
						const playerGameMessage = StartDuelClientMessage.create({
							lp: this.context.room.startLp,
							team: 0,
							playerMainDeckSize: Number(params[0]),
							playerExtraDeckSize: Number(params[1]),
							opponentMainDeckSize: Number(params[2]),
							opponentExtraDeckSize: Number(params[3]),
						});

						const opponentGameMessage = StartDuelClientMessage.create({
							lp: this.context.room.startLp,
							team: 0,
							playerMainDeckSize: Number(params[0]),
							playerExtraDeckSize: Number(params[1]),
							opponentMainDeckSize: Number(params[2]),
							opponentExtraDeckSize: Number(params[3]),
						});

						this.context.clients[0].socket.write(playerGameMessage);
						this.context.clients[1].socket.write(opponentGameMessage);
						core.stdin.write("CMD:RECORD_DECKS\n");
					}

					if (cmd === "CMD:BUFFER") {
						const location = Number(params[0]);
						const team = Number(params[1]);
						const bufferData = params.slice(2).map(Number);
						const buffer = Buffer.from(bufferData);

						this.context.clients[team].socket.write(
							UpdateDataClientMessage.create({ deckLocation: location, team, buffer })
						);
					}

					if (cmd === "CMD:DUEL") {
						core.stdin.write("CMD:PROCESS\n");
					}

					if (cmd === "CMD:MESSAGE") {
					}
				});
			});
		}

		this.context.execute();
	}
}
