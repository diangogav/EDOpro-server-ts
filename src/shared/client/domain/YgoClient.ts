import { Deck } from "@shared/deck/domain/Deck";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";
import { ISocket } from "../../socket/domain/ISocket";

export abstract class YgoClient {
	public readonly id: string | null;
	public readonly name: string;
	protected _host: boolean;
	protected _position: number;
	protected _team: number;
	protected _socket: ISocket;
	protected _lastMessage: Buffer | null = null;
	protected _reconnecting = false;
	protected _isReady: boolean;
	protected _ipAddress: string | null;
	protected _reconnectionToken: string | null = null;
	// How this client authenticated when it joined. Remembered so a later
	// spectator->player promotion can re-check league eligibility, and so the
	// reconnection layer can tell strong (ticket) from weak (PIN) clients.
	protected _credential: PlayerCredential | null = null;
	protected _deck: Deck;
	// Whether the account behind this client is verified. Admission starts the
	// lookup without waiting for it, so whoever needs the answer awaits it; it
	// stays on the client across reconnections, which keep the client object.
	private _accountVerification: Promise<boolean> = Promise.resolve(false);

	constructor({
		name,
		position,
		team,
		socket,
		host,
		id,
	}: {
		name: string;
		position: number;
		team: number;
		socket: ISocket;
		host: boolean;
		id: string | null;
	}) {
		this.id = id;
		this.name = name;
		this._position = position;
		this._socket = socket;
		this._team = team;
		this._host = host;
		this._ipAddress = socket.remoteAddress ?? null;
	}

	// -Infinity so the FIRST emote is always allowed, whatever `now` is (a 0
	// seed would block emotes sent within `cooldownMs` of the epoch).
	private _lastEmoteAt = Number.NEGATIVE_INFINITY;

	/**
	 * Emote rate-limit gate: returns true (and records `now`) when the cooldown
	 * has elapsed since the last accepted emote, false otherwise. Kept on the
	 * client so the window survives room state transitions.
	 */
	tryEmote(now: number, cooldownMs: number): boolean {
		if (now - this._lastEmoteAt < cooldownMs) return false;
		this._lastEmoteAt = now;
		return true;
	}

	get position(): number {
		return this._position;
	}

	get team(): number {
		return this._team;
	}

	setDeck(deck: Deck): void {
		this._deck = deck;
	}

	get deck(): Deck {
		return this._deck;
	}

	get socket(): ISocket {
		return this._socket;
	}

	playerPosition(position: number, team: number): void {
		this._position = position;
		this._team = team;
	}

	spectatorPosition(position: number): void {
		this._position = position;
		this._team = 3;
	}

	get isSpectator(): boolean {
		return this._team === 3;
	}

	get host(): boolean {
		return this._host;
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

	ready(): void {
		this._isReady = true;
	}

	notReady(): void {
		this._isReady = false;
	}

	get isReady(): boolean {
		return this._isReady;
	}

	get isReconnecting(): boolean {
		return this._reconnecting;
	}

	get reconnectionToken(): string | null {
		return this._reconnectionToken;
	}

	setReconnectionToken(token: string): void {
		this._reconnectionToken = token;
	}

	clearReconnectionToken(): void {
		this._reconnectionToken = null;
	}

	get credential(): PlayerCredential | null {
		return this._credential;
	}

	setCredential(credential: PlayerCredential): void {
		this._credential = credential;
	}

	public get accountVerification(): Promise<boolean> {
		return this._accountVerification;
	}

	public setAccountVerification(verification: Promise<boolean>): void {
		this._accountVerification = verification;
	}

	// A seat the server fills itself (an AI opponent), not a person. Rules
	// meant for players, such as the verified-account chat gate, skip it.
	// Only the YGOPro flow has such seats; it overrides this.
	public get isInternal(): boolean {
		return false;
	}

	// Joined with a strong handshake ticket (evolution client). Such a player
	// reconnects ONLY through its single-use token, so it must be unreachable
	// through the weak by-name reconnect path.
	get isStrongAuth(): boolean {
		return this._credential?.kind === "verified";
	}
}
