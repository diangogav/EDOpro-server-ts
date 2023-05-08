import { Client } from "../../../client/domain/Client";
import { Commands } from "../../domain/Commands";
import { RoomMessageHandlerContext } from "./RoomMessageHandlerContext";
import { NotReadyCommandStrategy } from "./Strategies/NotReadyCommandStrategy";
import { ReadyCommandStrategy } from "./Strategies/ReadyCommandStrategy";
import { RpsChoiceCommandStrategy } from "./Strategies/RpsChoiceCommandStrategy";
import { TryStartCommandStrategy } from "./Strategies/TryStartCommandStrategy";
import { UpdateDeckCommandStrategy } from "./Strategies/UpdateDeckCommandStrategy";

export class RoomMessageHandler {
	private readonly context: RoomMessageHandlerContext;

	constructor(data: Buffer, client: Client, clients: Client[]) {
		this.context = new RoomMessageHandlerContext(data, client, clients);
	}

	read(): void {
		if (this.context.isDataEmpty()) {
			return;
		}
		const header = this.context.readHeader();
		const command = header.subarray(2, 3).readInt8();

		if (command === Commands.UPDATE_DECK) {
			this.context.setStrategy(new UpdateDeckCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.READY) {
			this.context.setStrategy(new ReadyCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.NOT_READY) {
			this.context.setStrategy(new NotReadyCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.TRY_START) {
			this.context.setStrategy(new TryStartCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.RPS_CHOICE) {
			this.context.setStrategy(new RpsChoiceCommandStrategy(this.context));
		}

		this.context.execute();
	}
}
