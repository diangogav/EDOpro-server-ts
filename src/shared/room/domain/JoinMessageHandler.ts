import { ClientMessage } from "../../../edopro/messages/MessageProcessor";

export interface JoinMessageHandler {
	handle(message: ClientMessage): void;
}
