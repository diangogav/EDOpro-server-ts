import net from "net";

import { GameCreator } from "../../room/application/GameCreator";
import { JoinToGame } from "../../room/application/JoinToGame";
import { CreateGameMessage } from "../client-to-server/CreateGameMessage";
import { JoinGameMessage } from "../client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../client-to-server/PlayerInfoMessage";
import { Commands } from "../domain/Commands";
import { Message } from "../Message";

export class MessageHandler {
	private readonly HEADER_BYTES_LENGTH = 3;
	private data: Buffer;
	private previousMessage: Message;
	private readonly socket: net.Socket;

	constructor(data: Buffer, socket: net.Socket) {
		this.data = data;
		this.socket = socket;
	}

	read(): void {
		if (this.data.length === 0) {
			return;
		}
		const header = this.readHeader();
		const command = header.subarray(2, 3).readInt8();

		if (command === Commands.PLAYER_INFO) {
			const body = this.readBody(PlayerInfoMessage.MAX_BYTES_LENGTH);
			const playerInfoMessage = new PlayerInfoMessage(body);
			this.previousMessage = playerInfoMessage;
			this.read();
		}

		if (command === Commands.CREATE_GAME) {
			const body = this.readBody(CreateGameMessage.MAX_BYTES_LENGTH);
			const createGameMessage = new CreateGameMessage(body);
			const gameCreator = new GameCreator(this.socket);
			gameCreator.run(createGameMessage, (<PlayerInfoMessage>this.previousMessage).name);
			this.read();
		}

		if (command === Commands.JOIN_GAME) {
			const body = this.readBody(JoinGameMessage.MAX_BYTES_LENGTH);
			const joinGameMessage = new JoinGameMessage(body);
			const joinToGame = new JoinToGame(this.socket);
			joinToGame.run(joinGameMessage, (<PlayerInfoMessage>this.previousMessage).name);
		}
	}

	private readHeader(): Buffer {
		const header = this.data.subarray(0, this.HEADER_BYTES_LENGTH);
		this.data = this.data.subarray(this.HEADER_BYTES_LENGTH, this.data.length);

		return header;
	}

	private readBody(maxBytesLength: number): Buffer {
		const body = this.data.subarray(0, maxBytesLength);
		this.data = this.data.subarray(maxBytesLength, this.data.length);

		return body;
	}
}
