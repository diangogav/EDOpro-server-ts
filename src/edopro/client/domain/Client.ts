import { YgoClient } from "../../../shared/client/domain/YgoClient";
import { Logger } from "../../../shared/logger/domain/Logger";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Rank } from "../../../shared/value-objects/Rank";
import { Deck } from "../../deck/domain/Deck";
import { ClientMessage, MessageProcessor } from "../../messages/MessageProcessor";
import { Choose } from "../../rock-paper-scissor/RockPaperScissor";
import { Room } from "../../room/domain/Room";
import { RoomMessageEmitter } from "../../RoomMessageEmitter";

export class Listener {}

export class Client extends YgoClient {
	public readonly listener: Listener;
	public readonly roomId: number;
	private _rpsChosen: Choose | null = null;
	private _deck: Deck;
	private _duelPosition: number;
	private _turn: boolean;
	private _canReconnect: boolean;
	private _updatingDeck: boolean;
	private _readyCommand: boolean;
	private _readyMessage: ClientMessage;
	private readonly logger: Logger;

	constructor({
		socket,
		host,
		name,
		position,
		roomId,
		isReady = false,
		team,
		logger,
		ranks = [],
	}: {
		socket: ISocket;
		host: boolean;
		name: string;
		position: number;
		roomId: number;
		isReady?: boolean;
		team: number;
		logger: Logger;
		ranks: Rank[];
	}) {
		super({ name, position, team, socket, host, ranks });
		this.roomId = roomId;
		this._isReady = isReady;
		this.logger = logger;
	}

	setSocket(socket: ISocket, clients: Client[], room: Room): void {
		this._socket = socket;
		const messageProcessor = new MessageProcessor();
		const roomMessageEmitter = new RoomMessageEmitter(this, room);
		this._socket.onMessage((data) => {
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

	notReady(): void {
		this._isReady = false;
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

	get team(): number {
		return this._team;
	}

	setCanReconnect(value: boolean): void {
		this._canReconnect = value;
	}

	get canReconnect(): boolean {
		return this._canReconnect;
	}

	sendMessage(message: Buffer): void {
		this._socket.send(message);
	}

	updatingDeck(): void {
		this._updatingDeck = true;
	}

	deckUpdated(): void {
		this._updatingDeck = false;
	}

	get isUpdatingDeck(): boolean {
		return this._updatingDeck;
	}

	saveReadyCommand(message: ClientMessage): void {
		this._readyCommand = true;
		this._readyMessage = message;
	}

	clearReadyCommand(): void {
		this._readyCommand = false;
	}

	get haveReadyCommand(): boolean {
		return this._readyCommand;
	}

	get readyMessage(): ClientMessage {
		return this._readyMessage;
	}
}
