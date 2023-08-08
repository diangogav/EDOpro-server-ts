import { YGOClientSocket } from "../../../socket-server/HostServer";
import { Deck } from "../../deck/domain/Deck";
import { MessageProcessor } from "../../messages/MessageProcessor";
import { Choose } from "../../rock-paper-scissor/RockPaperScissor";
import { Room } from "../../room/domain/Room";
import { RoomMessageEmitter } from "../../RoomMessageEmitter";

export class Listener {}

export class Client {
	public readonly listener: Listener;
	public readonly host: boolean;
	public readonly name: string;
	public readonly roomId: number;
	private _team: number;
	private _position: number;
	private _socket: YGOClientSocket;
	private _isReady: boolean;
	private _rpsChosen: Choose | null = null;
	private _lastMessage: Buffer | null = null;
	private _reconnecting = false;
	private _deck: Deck;
	private _duelPosition: number;
	private _turn: boolean;

	constructor({
		socket,
		host,
		name,
		position,
		roomId,
		isReady = false,
		team,
	}: {
		socket: YGOClientSocket;
		host: boolean;
		name: string;
		position: number;
		roomId: number;
		isReady?: boolean;
		team: number;
	}) {
		this._socket = socket;
		this.host = host;
		this.name = name;
		this._position = position;
		this.roomId = roomId;
		this._isReady = isReady;
		this._team = team;
	}

	get socket(): YGOClientSocket {
		return this._socket;
	}

	setSocket(socket: YGOClientSocket, clients: Client[], room: Room): void {
		this._socket = socket;
		const messageProcessor = new MessageProcessor();
		const roomMessageEmitter = new RoomMessageEmitter(this, room);
		this._socket.on("data", (data) => {
			roomMessageEmitter.handleMessage(data);
			messageProcessor.read(data);
			// this.handleMessage(messageProcessor, clients, room);
		});
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

	get cache(): Buffer | null {
		return this._lastMessage;
	}

	setLastMessage(message: Buffer): void {
		this._lastMessage = message;
	}

	reconnecting(): void {
		this._reconnecting = true;
	}

	clearReconnecting(): void {
		this._reconnecting = false;
	}

	get isReconnecting(): boolean {
		return this._reconnecting;
	}

	setDeck(deck: Deck): void {
		this._deck = deck;
	}

	get deck(): Deck {
		return this._deck;
	}

	setDuelPosition(position: number): void {
		this._duelPosition = position;
	}

	get duelPosition(): number {
		return this._duelPosition;
	}

	turn(): void {
		this._turn = true;
	}

	clearTurn(): void {
		this._turn = false;
	}

	get inTurn(): boolean {
		return this._turn;
	}

	get isSpectator(): boolean {
		return this._team === 3;
	}

	spectatorPosition(position: number): void {
		this._position = position;
		this._team = 3;
	}

	get position(): number {
		return this._position;
	}

	playerPosition(position: number, team: number): void {
		this._position = position;
		this._team = team;
	}

	get team(): number {
		return this._team;
	}

	sendMessage(message: Buffer): void {
		this._socket.write(message);
		// if (this.isReconnecting) {
		// 	return;
		// }

		// this._socket.write(message, (error: unknown) => {
		// 	if (error) {
		// 		setTimeout(() => {
		// 			this.sendMessage(message);
		// 		}, 1000);
		// 	}
		// });
	}
}
