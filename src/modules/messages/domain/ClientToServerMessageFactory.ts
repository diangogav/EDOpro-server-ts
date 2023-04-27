import { CreateGameMessage } from "../client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "../client-to-server/PlayerInfoMessage";
import { Message } from "../Message";
import { Commands } from "./Commands";

export class ClientToServerMessageFactory {
	get(buffer: Buffer): Message {
		const header = buffer.subarray(0, 3);
		const command = header.subarray(2, 3).readInt8();

		if (command === Commands.PLAYER_INFO) {
			return new PlayerInfoMessage(buffer);
		}
		if (command === Commands.CREATE_GAME) {
			return new CreateGameMessage(buffer);
		}

		throw new Error("unknown message");
	}
}
