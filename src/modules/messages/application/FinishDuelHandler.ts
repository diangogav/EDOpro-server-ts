import { Room } from "../../room/domain/Room";
import { SideDeckClientMessage } from "../server-to-client/game-messages/SideDeckClientMessage";

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
	}
}
