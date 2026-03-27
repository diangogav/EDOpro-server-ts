import { ClientMessage } from "../../messages/MessageProcessor";

export interface GameCreatorMessageHandler {
	handleCreateGame(message: ClientMessage): Promise<void>;
}
