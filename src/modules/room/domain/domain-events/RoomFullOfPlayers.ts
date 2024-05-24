import { YGOClientSocket } from "../../../shared/socket/domain/YGOClientSocket";
import { JoinGameMessage } from "../../../messages/client-to-server/JoinGameMessage";
import { Room } from "../Room";

type RoomFullOfPlayersData = {
	socket: YGOClientSocket;
	message: JoinGameMessage;
	playerName: string;
	room: Room;
};

export class RoomFullOfPlayersDomainEvent {
	static readonly DOMAIN_EVENT = "ROOM_FULL_OF_PLAYERS";
	readonly data: RoomFullOfPlayersData;

	constructor(data: RoomFullOfPlayersData) {
		this.data = data;
	}
}
