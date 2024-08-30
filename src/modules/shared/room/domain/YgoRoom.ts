import { PlayerData } from "@modules/shared/player/domain/PlayerData";
import { Duel } from "@modules/shared/room/Duel";
import { Team } from "@modules/shared/room/Team";
import { EventEmitter } from "stream";

import { MercuryClient } from "../../../../mercury/client/domain/MercuryClient";
import { Client } from "../../../client/domain/Client";
import { YgoClient } from "../../client/domain/YgoClient";
import { ISocket } from "../../socket/domain/ISocket";
import { Match } from "./match/domain/Match";

export enum DuelState {
	WAITING = "waiting",
	DUELING = "dueling",
	RPS = "rps",
	CHOOSING_ORDER = "choosingOrder",
	SIDE_DECKING = "sideDecking",
}

export abstract class YgoRoom {
	public readonly team0: number;
	public readonly team1: number;
	public readonly ranked: boolean;
	public readonly bestOf: number;
	public readonly startLp: number;
	public readonly STARTING_TURN = 0;
	protected readonly t0Positions: number[] = [];
	protected readonly t1Positions: number[] = [];
	protected emitter: EventEmitter;
	protected _state: DuelState;
	protected _spectatorCache: Buffer[] = [];
	protected _clients: YgoClient[] = [];
	protected _spectators: YgoClient[] = [];
	protected _clientWhoChoosesTurn: YgoClient;
	protected _match: Match | null;
	protected _firstToPlay: number;
	protected isStart: string;
	protected currentDuel: Duel | null = null;

	protected constructor({
		team0,
		team1,
		ranked,
		bestOf,
		startLp,
	}: {
		team0: number;
		team1: number;
		ranked: boolean;
		bestOf: number;
		startLp: number;
	}) {
		this.team0 = team0;
		this.team1 = team1;
		this.ranked = ranked;
		this.bestOf = bestOf;
		this.t0Positions = Array.from({ length: this.team0 }, (_, index) => index);
		this.t1Positions = Array.from({ length: this.team1 }, (_, index) => this.team0 + index);
		this.isStart = "waiting";
		this.startLp = startLp;
	}

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

	duelWinner(winner: number): void {
		if (!this._match) {
			return;
		}
		this._match.duelWinner(winner, 0);
	}

	get matchPlayersHistory(): PlayerData[] {
		return this._match?.playersHistory ?? [];
	}

	get clients(): YgoClient[] {
		return this._clients;
	}

	get spectators(): YgoClient[] {
		return this._spectators;
	}

	calculatePlace(startPosition?: number): { position: number; team: number } | null {
		const team0 = this.clients
			.filter((client: Client) => client.team === 0)
			.map((client) => client.position);

		const availableTeam0Positions = this.getDifference(this.t0Positions, team0);

		if (availableTeam0Positions.length > 0) {
			const nextPosition0 = this.findNextPosition(availableTeam0Positions, startPosition);
			if (nextPosition0 !== null) {
				return {
					position: nextPosition0,
					team: 0,
				};
			}
		}

		const team1 = this.clients
			.filter((client: Client) => client.team === 1)
			.map((client) => client.position);

		const availableTeam1Positions = this.getDifference(this.t1Positions, team1);

		if (availableTeam1Positions.length > 0) {
			const nextPosition1 = this.findNextPosition(availableTeam1Positions, startPosition);
			if (nextPosition1 !== null) {
				return {
					position: nextPosition1,
					team: 1,
				};
			}
		}

		return null;
	}

	setClientWhoChoosesTurn(client: YgoClient): void {
		this._clientWhoChoosesTurn = client;
	}

	createMatch(): void {
		this._match = new Match({ bestOf: this.bestOf });
		this.initializeHistoricalData();
	}

	initializeHistoricalData(): void {
		const players = this.clients.map((client: Client) => ({
			team: client.team,
			name: client.name,
			ranks: client.ranks,
			// deck: client.deck,
		}));
		this._match?.initializeHistoricalData(players);
	}

	isMatchFinished(): boolean {
		if (!this._match) {
			return true;
		}

		return this._match.isFinished();
	}

	setFirstToPlay(team: number): void {
		this._firstToPlay = team;
	}

	matchScore(): { team0: number; team1: number } {
		if (!this._match) {
			return {
				team0: 0,
				team1: 0,
			};
		}

		return this._match.score;
	}

	playerNames(team: number): string {
		return this.clients
			.filter((player: Client) => player.team === team)
			.map((item: Client) => `${item.name}`)
			.join(",");
	}

	createDuel(banListName: string | null): void {
		this.currentDuel = new Duel(this.STARTING_TURN, [this.startLp, this.startLp], banListName);
	}

	decreaseLps(team: Team, value: number): void {
		this.currentDuel?.decreaseLps(team, value);
	}

	increaseLps(team: Team, value: number): void {
		this.currentDuel?.increaseLps(team, value);
	}

	get firstToPlay(): number {
		return this._firstToPlay;
	}

	get clientWhoChoosesTurn(): YgoClient {
		return this._clientWhoChoosesTurn;
	}

	get score(): string {
		return `Score: ${this.playerNames(0)}: ${this.matchScore().team0} - ${
			this.matchScore().team1
		} ${this.playerNames(1)}`;
	}

	protected findNextPosition(availablePositions: number[], startPosition?: number): number | null {
		if (startPosition !== undefined) {
			for (const pos of availablePositions) {
				if (pos > startPosition) {
					return pos;
				}
			}
		}

		return availablePositions.length > 0 ? availablePositions[0] : null;
	}

	protected getDifference(a: number[], b: number[]): number[] {
		return a.filter((item) => !b.includes(item));
	}
}
