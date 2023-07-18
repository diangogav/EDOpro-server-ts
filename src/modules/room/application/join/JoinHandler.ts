import { ErrorClientMessage } from "../../../messages/server-to-client/ErrorClientMessage";

export interface JoinHandler {
	setNextHandler(handler: JoinHandler): JoinHandler;
	tryToJoin(): Promise<ErrorClientMessage | null>;
}
