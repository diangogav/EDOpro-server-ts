import { DuelFinishReason } from "../../room/domain/DuelFinishReason";
import { Room } from "../../room/domain/Room";
import RoomList from "../../room/infrastructure/RoomList";
import { SideDeckClientMessage } from "../server-to-client/game-messages/SideDeckClientMessage";
import { SideDeckWaitClientMessage } from "../server-to-client/game-messages/SideDeckWaitClientMessage";
import { ReplayPromptMessage } from "../server-to-client/ReplayPromptMessage";
import { ServerMessageClientMessage } from "../server-to-client/ServerMessageClientMessage";

export class FinishDuelHandler {
	private readonly reason: DuelFinishReason;
	private readonly winner: number;
	private readonly room: Room;

	constructor({ reason, winner, room }: { reason: DuelFinishReason; winner: number; room: Room }) {
		this.reason = reason;
		this.winner = winner;
		this.room = room;
	}

	run(): void {
		this.room.duel?.kill();
		this.room.duelWinner(this.winner);

		const scoreTitleMessage = ServerMessageClientMessage.create("Score: ");
		const scorePlayerMessage = ServerMessageClientMessage.create(
			`${this.room.playerNames(0)}: ${this.room.matchScore().team0}`
		);
		const scoreOpponentMessage = ServerMessageClientMessage.create(
			`${this.room.playerNames(1)}: ${this.room.matchScore().team1}`
		);

		this.room.clients.forEach((player) => {
			player.socket.write(scoreTitleMessage);
			player.socket.write(scorePlayerMessage);
			player.socket.write(scoreOpponentMessage);
		});

		this.room.spectators.forEach((spectator) => {
			spectator.socket.write(scoreTitleMessage);
			spectator.socket.write(scorePlayerMessage);
			spectator.socket.write(scoreOpponentMessage);
		});

		const replayPromptMessage = ReplayPromptMessage.create();

		this.room.clients.forEach((item) => {
			item.socket.write(replayPromptMessage);
		});

		if (this.room.isMatchFinished()) {
			this.room.clients.forEach((player) => {
				player.socket.destroy();
			});

			this.room.spectators.forEach((spectator) => {
				spectator.socket.destroy();
			});

			this.room.duel?.kill("SIGTERM");

			RoomList.deleteRoom(this.room);

			return;
		}

		const message = SideDeckClientMessage.create();

		this.room.sideDecking();

		const looser = this.room.clients[Number(!this.winner)];

		this.room.setClientWhoChoosesTurn(looser);
		this.room.clients.forEach((client) => {
			client.socket.write(message);
			client.notReady();
		});

		this.room.spectators.forEach((spectator) => {
			spectator.socket.write(SideDeckWaitClientMessage.create());
		});
	}
}
