import { PlayerInfoMessage } from "../../../client-to-server/PlayerInfoMessage";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class PlayerInfoCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(
		private readonly context: MessageHandlerContext,
		private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const body = this.context.readBody(PlayerInfoMessage.MAX_BYTES_LENGTH);
		this.context.updatePreviousMessage(new PlayerInfoMessage(body));
		this.afterExecuteCallback();
	}
}
