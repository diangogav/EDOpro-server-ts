import { JoinGameMessage } from "../../../messages/client-to-server/JoinGameMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Room } from "../Room";

type RoomFullOfPlayersData = {
	socket: ISocket;
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
