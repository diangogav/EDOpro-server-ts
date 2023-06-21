import { YGOClientSocket } from "../../../socket-server/HostServer";
import { Choose } from "../../rock-paper-scissor/RockPaperScissor";

export class Listener {}

export class Client {
	public readonly socket: YGOClientSocket;
	public readonly listener: Listener;
	public readonly host: boolean;
	public readonly name: string;
	public readonly position: number;
	public readonly roomId: number;
	private _isReady: boolean;
	private _rpsChosen: Choose | null = null;

	constructor(
		socket: YGOClientSocket,
		host: boolean,
		name: string,
		position: number,
		roomId: number,
		isReady = false
	) {
		this.socket = socket;
		this.host = host;
		this.name = name;
		this.position = position;
		this.roomId = roomId;
		this._isReady = isReady;
	}

	setRpsChosen(choise: Choose): void {
		this._rpsChosen = choise;
	}

	clearRpsChoise(): void {
		this._rpsChosen = null;
	}

	get rpsChoise(): Choose | null {
		return this._rpsChosen;
	}

	ready(): void {
		this._isReady = true;
	}

	notReady(): void {
		this._isReady = false;
	}

	get isReady(): boolean {
		return this._isReady;
	}
}
