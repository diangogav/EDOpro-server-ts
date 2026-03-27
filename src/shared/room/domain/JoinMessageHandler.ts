import { ClientMessage } from "../../messages/MessageProcessor";

export interface JoinMessageHandler {
	handleJoinGame(message: ClientMessage): void;
}
