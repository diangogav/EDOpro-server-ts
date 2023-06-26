import { YGOClientSocket } from "../../../socket-server/HostServer";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { DuelStartClientMessage } from "../../messages/server-to-client/DuelStartClientMessage";
import { StartDuelClientMessage } from "../../messages/server-to-client/game-messages/StartDuelClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import ReconnectingPlayers, { ReconnectInfo } from "../../shared/ReconnectingPlayers";
import { RoomFinder } from "./RoomFinder";

export class ReconnectToGame {
	constructor(private readonly socket: YGOClientSocket, private readonly roomFinder: RoomFinder) {}

	run(message: JoinGameMessage, playerName: string, reconnectInfo: ReconnectInfo): void {
		if (!this.socket.id) {
			return;
		}

		const room = this.roomFinder.run(reconnectInfo.socketId);

		if (!room) {
			return;
		}

		const client = room.clients[reconnectInfo.position];

		client.setSocket(this.socket, room.clients, room);
		client.reconnecting();
		this.socket.write(JoinGameClientMessage.createFromRoom(message, room));
		this.socket.write(DuelStartClientMessage.create());
		this.socket.write(
			StartDuelClientMessage.create({
				lp: room.startLp,
				team: client.team,
				playerMainDeckSize: room.playerMainDeckSize,
				playerExtraDeckSize: room.playerExtraDeckSize,
				opponentMainDeckSize: room.opponentMainDeckSize,
				opponentExtraDeckSize: room.opponentExtraDeckSize,
			})
		);

		// let currentPlayer = Boolean(client.team);
		// for (let index = 0; index <= room.turn - 1; index++) {
		// 	this.socket.write(Buffer.from([0x03, 0x00, 0x01, 0x28, Number(currentPlayer)]));
		// 	currentPlayer = !currentPlayer;
		// }
		this.socket.write(Buffer.from([0x03, 0x00, 0x01, 0x28, 0x00]));
		this.socket.write(Buffer.from([0x03, 0x00, 0x01, 0x28, 0x01]));

		// this.socket.write(Buffer.from([0x04, 0x00, 0x01, 0x29, 0x04, 0x00]));

		// this.socket.write(
		// 	Buffer.from([
		// 		0x60, 0x00, 0x01, 0x06, 0x00, 0x06, 0x0d, 0x00, 0xe8, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00,
		// 		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00,
		// 		0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00,
		// 		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		// 		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00, 0x06,
		// 		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00,
		// 		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		// 	])
		// );

		// this.socket.write(
		// 	Buffer.from([
		// 		0x36, 0x00, 0x01, 0xa2, 0x02, 0x40, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		// 		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x26, 0x06, 0x00, 0x00, 0x03, 0x00,
		// 		0x40, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		// 		0x00, 0x00, 0x00, 0x00, 0x26, 0x06, 0x00, 0x00, 0x03, 0x00, 0x00,
		// 	])
		// );
		room.duel?.stdin.write(`CMD:FIELD|${client.team}\n`);
		ReconnectingPlayers.delete(reconnectInfo);

		// this.socket.write(DuelStartClientMessage.create());
		// this.socket.write(
		// 	StartDuelClientMessage.create({
		// 		lp: room.startLp,
		// 		team: client.team,
		// 		playerMainDeckSize: room.playerMainDeckSize,
		// 		playerExtraDeckSize: room.playerExtraDeckSize,
		// 		opponentMainDeckSize: room.opponentMainDeckSize,
		// 		opponentExtraDeckSize: room.opponentExtraDeckSize,
		// 	})
		// );

		// client.socket.write(TurnClientMessage.create(0));
		// client.socket.write(TurnClientMessage.create(1));
		// client.socket.write(Buffer.from([0x03, 0x00, 0x029, 0x04, 0x00]));

		// const turnPlayer = room.firstToPlay;
		// const newTurnCount = turnPlayer === 1 ? 2 : 1;
		// for (let turn = 0; turn < newTurnCount; turn++) {
		// 	client.socket.write(TurnClientMessage.create(turn));
		// }
		// this.socket.write(CatchUpClientMessage.create({ catchingUp: true }));
		// room.getplayerCache(1).forEach((item) => {
		// 	this.socket.write(item);
		// });

		// this.socket.write(CatchUpClientMessage.create({ catchingUp: false }));
		// this.socket.write(Buffer.from([0x01, 0x00, 0xa2]));
		// client.clearReconnecting();
	}
}
