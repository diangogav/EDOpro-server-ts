import { Room } from "../../room/domain/Room";
import { SideDeckClientMessage } from "../server-to-client/game-messages/SideDeckClientMessage";
import { SideDeckWaitClientMessage } from "../server-to-client/game-messages/SideDeckWaitClientMessage";

export class FinishDuelHandler {
	private readonly reason: number;
	private readonly winner: number;
	private readonly room: Room;

	constructor({ reason, winner, room }: { reason: number; winner: number; room: Room }) {
		this.reason = reason;
		this.winner = winner;
		this.room = room;
	}

	run(): void {
		this.room.duel?.kill();
		this.room.duelWinner(this.winner);

		if (this.room.isMatchFinished()) {
			console.log(
				"Ganador: ",
				this.room.clients
					.filter((client) => client.team === this.winner)
					.map((client) => client.name.replace(/\0/g, "").trim())
			);

			console.log(
				"Perdedor: ",
				this.room.clients
					.filter((client) => client.team !== this.winner)
					.map((client) => client.name)
			);

			console.log("Score", this.room.matchScore());

			return;
		}

		const message = SideDeckClientMessage.create();

		this.room.sideDecking();

		const looser = this.room.clients[Number(!this.winner)];

		this.room.setClientWhoChoosesTurn(looser);
		this.room.clients.forEach((client) => {
			console.log("sending to client:", message);
			client.socket.write(message);
			client.notReady();
		});

		this.room.spectators.forEach((spectator) => {
			spectator.socket.write(SideDeckWaitClientMessage.create());
		});
	}
}
