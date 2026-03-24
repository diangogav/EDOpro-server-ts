import { ClientMessage } from "../../../edopro/messages/MessageProcessor";

export interface JoinMessageHandler {
	handleJoinGame(message: ClientMessage): void;
}
