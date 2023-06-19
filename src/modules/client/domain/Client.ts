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
	private isReady: boolean;
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
		this.isReady = isReady;
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
		this.isReady = true;
	}

	notReady(): void {
		this.isReady = false;
	}

	get status(): boolean {
		return this.isReady;
	}
}
