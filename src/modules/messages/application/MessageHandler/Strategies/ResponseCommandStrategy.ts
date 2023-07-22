import { Client } from "../../../../client/domain/Client";
import RoomList from "../../../../room/infrastructure/RoomList";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class ResponseCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(private readonly context: MessageHandlerContext) {}

	execute(): void {
		const clients: Client[] = RoomList.getRooms()
			.map((room) => room.clients)
			.flat();

		const client = clients.find((client) => client.socket.id === this.context.socket.id);

		if (!client) {
			return;
		}

		const room = RoomList.getRooms().find((room) => room.id === client.roomId);

		if (!room || !room.duel) {
			return;
		}

		// const messageLength = this.context.messageLength();
		// const message = this.context.readBody(messageLength);
		const message = this.context.readBody();
		const data = message
			.toString("hex")
			.match(/.{1,2}/g)
			?.join("|");

		if (!data) {
			return;
		}

		room.stopTimer(client.team);
		room.duel.stdin.write(`CMD:RESPONSE|${client.team}|${data}\n`);
	}
}
