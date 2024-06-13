import { ClientMessage } from "../../../messages/MessageProcessor";

export interface GameCreatorMessageHandler {
	handle(message: ClientMessage): Promise<void>;
}
