import { JoinGameMessage } from "../../../messages/client-to-server/JoinGameMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Room } from "../Room";

type ClientEnteredDuringDuelData = {
	socket: ISocket;
	message: JoinGameMessage;
	playerName: string;
	room: Room;
};

export class ClientEnteredDuringDuelDomainEvent {
	static readonly DOMAIN_EVENT = "CLIENT_ENTERED_DURING_DUEL";
	readonly data: ClientEnteredDuringDuelData;

	constructor(data: ClientEnteredDuringDuelData) {
		this.data = data;
	}
}
