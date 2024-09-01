import { ClientMessage } from "../../../edopro/messages/MessageProcessor";

export interface GameCreatorMessageHandler {
	handle(message: ClientMessage): Promise<void>;
}
