import { EventEmitter } from "stream";

import { MercuryClient } from "../../../../mercury/client/domain/MercuryClient";
import { YGOClientSocket } from "../../../../socket-server/HostServer";
import { Client } from "../../../client/domain/Client";

export enum DuelState {
	WAITING = "waiting",
	DUELING = "dueling",
	RPS = "rps",
	CHOOSING_ORDER = "choosingOrder",
	SIDE_DECKING = "sideDecking",
}

export abstract class YgoRoom {
	protected emitter: EventEmitter;
	protected _state: DuelState;
	protected _spectatorCache: Buffer[] = [];

	emit(event: string, message: unknown, socket: YGOClientSocket): void {
		this.emitter.emit(event, message, this, socket);
	}

	emitRoomEvent(event: string, message: unknown, client: Client | MercuryClient): void {
		this.emitter.emit(event, message, this, client);
	}

	get duelState(): DuelState {
		return this._state;
	}

	get spectatorCache(): Buffer[] {
		return this._spectatorCache;
	}

	clearSpectatorCache(): void {
		this._spectatorCache = [];
	}
}
