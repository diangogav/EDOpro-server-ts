import { Client } from "../../../../client/domain/Client";
import { DuelFinishReason } from "../../../../room/domain/DuelFinishReason";
import RoomList from "../../../../room/infrastructure/RoomList";
import { FinishDuelHandler } from "../../FinishDuelHandler";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class SurrenderCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(private readonly context: MessageHandlerContext) {}

	execute(): void {
		const clients: Client[] = RoomList.getRooms()
			.map((room) => [...room.clients, ...room.spectators])
			.flat();

		const client = clients.find((client) => client.socket.id === this.context.socket.id);

		if (!client) {
			return;
		}

		const room = RoomList.getRooms().find((item) => item.id === client.roomId);

		if (!room) {
			return;
		}

		const finishDuelHandler = new FinishDuelHandler({
			reason: DuelFinishReason.SURRENDERED,
			winner: Number(!client.team),
			room,
		});

		finishDuelHandler.run();
	}
}
