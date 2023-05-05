import type net from "net";

import { Choose } from "../../rock-paper-scissor/RockPaperScissor";

export class Listener {}

export class Client {
	public readonly socket: net.Socket;
	public readonly listener: Listener;
	public readonly host: boolean;
	public readonly name: string;
	public readonly position: number;
	private _rpsChosen: Choose | null = null;

	constructor(socket: net.Socket, host: boolean, name: string, position: number) {
		this.socket = socket;
		this.host = host;
		this.name = name;
		this.position = position;
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
}
