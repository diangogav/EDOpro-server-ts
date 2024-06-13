import { ClientMessage } from "../../../messages/MessageProcessor";

export interface JoinMessageHandler {
	handle(message: ClientMessage): void;
}
