import { EventEmitter } from "stream";

import { MercuryClient } from "../../../../mercury/client/domain/MercuryClient";
import { Client } from "../../../client/domain/Client";
import { YgoClient } from "../../client/domain/YgoClient";
import { ISocket } from "../../socket/domain/ISocket";

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
	protected _clients: YgoClient[] = [];

	emit(event: string, message: unknown, socket: ISocket): void {
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

	removePlayer(player: YgoClient): void {
		this._clients = this._clients.filter((item) => item.socket.id !== player.socket.id);
	}

	get clients(): YgoClient[] {
		return this._clients;
	}
}
