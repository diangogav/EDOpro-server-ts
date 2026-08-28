import { EventEmitter } from "stream";

import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "@edopro/room/domain/RoomState";

import { Team } from "@shared/room/Team";
import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";
import { Seat } from "@shared/room/admission/domain/Seat";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";
import { AdmissionTarget, AdmitToRoom } from "@ygopro/room/admission/application/AdmitToRoom";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { CredentialResolver } from "@ygopro/room/admission/application/CredentialResolver";
import { RoomAdmission } from "@shared/room/admission/domain/RoomAdmission";
import { Logger } from "@shared/logger/domain/Logger";
import { DeckRules, DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";
import { RoomType } from "@shared/room/domain/RoomType";
import { MessageRepository } from "@shared/messages/MessageRepository";
import { ISocket } from "@shared/socket/domain/ISocket";
import { Deck } from "@shared/deck/domain/Deck";

import MercuryBanListMemoryRepository from "../../ban-list/infrastructure/YGOProBanListMemoryRepository";
import { YGOProClient } from "../../client/domain/YGOProClient";
import {
	resolveCardPool,
	formatRuleMappings,
	priorityRuleMappings,
	ruleMappings,
} from "./RuleMappings";
import { YGOProChoosingOrderState } from "./states/YGOProChoosingOrderState";
import { YGOProDuelingState } from "./states/YGOProDuelingState";
import { YGOProRockPaperScissorState } from "./states/YGOProRockPaperScissorState";
import { YGOProSideDeckingState } from "./states/YGOProSideDeckingState";
import { YGOProWaitingState } from "./states/YGOProWaitingState";
import { HostInfo } from "./host-info/HostInfo";
import { getLobbyDuelInfo } from "./LobbyDuelFlags";

import {
	ChatColor,
	ErrorMessageType,
	GameMode,
	NetPlayerType,
	PlayerChangeState,
	YGOProMsgBase,
	YGOProStocChat,
	YGOProStocDeckCount,
	YGOProStocDeckCount_DeckInfo,
} from "ygopro-msg-encode";
import { YGOProYrp } from "ygopro-yrp-encode";
import { DuelRecord } from "./DuelRecord";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { CardYGOProRepository } from "@ygopro/card/infrastructure/CardYGOProRepository";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";

const BEST_OF = {
	[GameMode.SINGLE]: 1,
	[GameMode.MATCH]: 3,
	[GameMode.TAG]: 1,
};

// Computed once at module load (not per YGOProRoom.create() call).
// Order matters: later tiers overwrite earlier ones for the same hostInfo key.
const MODE_TIER = Object.values(ruleMappings);
const FORMAT_TIER = Object.values(formatRuleMappings);
const PRIORITY_TIER = Object.values(priorityRuleMappings);
const RULE_MAPPING_TIERS = [MODE_TIER, FORMAT_TIER, PRIORITY_TIER];

export class YGOProRoom extends YgoRoom {
	readonly name: string;
	readonly password: string;
	readonly league: RoomLeague;
	readonly createdBySocketId: string;
	readonly banListHash: number;
	readonly cardPool: string;
	//TODO: compatibility with edopro list and rank;
	private _edoBanListHash: number;
	private _logger: Logger;
	private _roomState: RoomState | null = null;
	private _isPositionSwapped: boolean = false;
	private _duelRecords: DuelRecord[] = [];
	private _currentDuelRecord: DuelRecord;
	private readonly _hostInfo: HostInfo;
	private readonly _messageRepository: MessageRepository;
	private readonly _cardRepository: CardYGOProRepository;
	private readonly _deckRules: DeckRules;

	windbot?: { name: string; deck: string };
	noHost: boolean = false;
	noReconnect: boolean = false;
	/** True only for rooms pre-created by the matchmaking queue. Their WAITING
	 * lifecycle is atomic: if either participant leaves, the reservation aborts. */
	isMatchmaking: boolean = false;

	/** Present only on rooms whose seats were assigned before anyone connected
	 * (matchmaking): the userIds allowed through the JOIN door. Undefined for
	 * ordinary rooms, which admit by (name, password) alone. */
	reservedUserIds?: readonly string[];

	// Set to true when the room begins teardown (removeRoom entry point in YGOProDuelingState).
	// The WindBotJoinStrategy retry-abort callback reads this to stop retrying when the room
	// is being torn down.
	finalizing: boolean = false;

	// Set when a duel in a match ends in a DRAW. KDE Tournament Policy §IV.F:
	// after a drawn duel the loser-chooses rule does not apply — "another random
	// method should be employed", so side-decking must re-enter RPS instead of
	// reusing the previous game's chooser.
	turnChoiceRequiresRps = false;

	private constructor({
		id,
		name,
		password = "",
		hostInfo,
		team0,
		team1,
		league,
		createdBySocketId,
		bestOf,
		startLp,
		messageRepository,
		banListHash,
		cardPool,
	}: {
		id: number;
		password: string;
		name: string;
		hostInfo: HostInfo;
		team0: number;
		team1: number;
		league: RoomLeague;
		createdBySocketId: string;
		bestOf: number;
		startLp: number;
		messageRepository: MessageRepository;
		banListHash: number;
		cardPool: string;
	}) {
		super({
			team0,
			team1,
			ranked: league.isRanked,
			bestOf,
			startLp,
			id,
			notes: "",
			roomType: RoomType.MERCURY,
		});
		this.name = name;
		this.password = password;
		this.league = league;
		this._players = [];
		this._hostInfo = hostInfo;
		this._state = DuelState.WAITING;
		this.banListHash = banListHash;
		this.cardPool = cardPool;
		this.createdBySocketId = createdBySocketId;
		this._messageRepository = messageRepository;
		this._cardRepository = new CardYGOProRepository(this.cardPool);
		this._deckRules = new DeckRules({
			mainMin: 40,
			mainMax: 60,
			extraMin: 0,
			extraMax: 15,
			sideMin: 0,
			sideMax: 15,
			rule: this._hostInfo.rule,
			maxDeckPoints: this._hostInfo.max_deck_points,
		});
		const banList = MercuryBanListMemoryRepository.findByHash(banListHash);
		const edoBanList = BanListMemoryRepository.findByName(banList?.name ?? "");
		this._edoBanListHash = edoBanList?.hash ?? 0;
	}

	static create(
		id: number,
		command: string,
		logger: Logger,
		emitter: EventEmitter,
		playerInfo: PlayerInfoMessage,
		createdBySocketId: string,
		messageRepository: MessageRepository,
		rankedOverride?: boolean,
	): YGOProRoom {
		let hostInfo: HostInfo = {
			lflist: MercuryBanListMemoryRepository.getFirstTCGIndex(),
			rule: 1,
			mode: GameMode.SINGLE,
			duel_rule: 5,
			no_check_deck: 0,
			no_shuffle_deck: 0,
			start_lp: 8000,
			start_hand: 5,
			draw_count: 1,
			time_limit: 450,
			max_deck_points: 100,
			best_of: BEST_OF[GameMode.SINGLE],
		};

		const [configuration, password = ""] = command.split("#");
		const options = configuration
			.toLowerCase()
			.split(",")
			.map((_) => _.trim());

		// One loop over the three tiers (mode → format → priority), each tier
		// fully applied to every option before the next tier starts — so later
		// tiers still overwrite earlier ones for the same hostInfo key, and a
		// double-match is only ever checked WITHIN a single tier's mapping list.
		for (const tierMappings of RULE_MAPPING_TIERS) {
			options.forEach((option) => {
				const items = tierMappings.filter((item) => item.validate(option));
				if (items.length > 1) {
					throw new Error(`Error: param match with two rules.`);
				}

				const mapping = items.shift();
				if (mapping) {
					const rule = mapping.get(option);
					hostInfo = { ...hostInfo, ...rule };
				}
			});
		}

		const teamCount = hostInfo.mode === GameMode.TAG ? 2 : 1;
		// The host's explicit "casual" token wins over any ranked default — a
		// ticket-authenticated user must be able to host unranked rooms.
		const casual = options.includes("casual");
		const league = RoomLeague.determine({
			casual,
			rankedOverride,
			hasPin: Boolean(playerInfo.password),
		});
		const cardPool = resolveCardPool(options);
		const banList = MercuryBanListMemoryRepository.findLFListByIndex(hostInfo.lflist);
		const banListHash = banList?.hash ?? 0;

		const room = new YGOProRoom({
			id,
			hostInfo,
			name: configuration,
			password,
			team0: teamCount,
			team1: teamCount,
			league,
			createdBySocketId,
			bestOf: hostInfo.best_of,
			startLp: hostInfo.start_lp,
			messageRepository,
			banListHash,
			cardPool,
		});

		room._logger = logger.child({ file: "MercuryRoom" });
		room.emitter = emitter;

		return room;
	}

	shouldValidateDeck(): boolean {
		return !this._hostInfo.no_check_deck;
	}

	get isTag() {
		return (this.hostInfo.mode & 0x2) !== 0;
	}

	get mode() {
		return this.hostInfo.mode > 2 ? (this.isTag ? 2 : 1) : this.hostInfo.mode;
	}

	getTeamPlayers(team: number): YGOProClient[] {
		return (this.players as YGOProClient[])
			.filter((client) => client.team === team)
			.sort((a, b) => a.position - b.position);
	}

	get isMatch(): boolean {
		return this.bestOf > 1;
	}

	get duelMode(): string {
		return this.isTag ? "tag" : this.isMatch ? "match" : "single";
	}

	get shuffleDeckEnabled(): boolean {
		return !this.hostInfo.no_shuffle_deck;
	}

	setPositionSwapped(value: boolean): void {
		this._isPositionSwapped = value;
	}

	get isPositionSwapped(): boolean {
		return this._isPositionSwapped;
	}

	get hostInfo(): HostInfo {
		return {
			...this._hostInfo,
			mode: this._hostInfo.mode,
			lflist: this.banListHash,
		};
	}

	get playersCount(): number {
		return this._players.length;
	}

	get isPlayersFull(): boolean {
		return (
			(this._hostInfo.mode === GameMode.SINGLE || this._hostInfo.mode === GameMode.MATCH) &&
			this.playersCount === 2
		);
	}

	/**
	 * Minimal read-only routing hint for YGOProRoomList.findJoinableByName.
	 * This is a LOCK-FREE read (does not take the room mutex) — it is only ever
	 * used to decide whether a room is worth attempting to join. Real admission
	 * still runs exclusively under AdmitToRoom / calculatePlace (which DOES take
	 * the mutex), so a seat that looks free here can still lose the race by the
	 * time admission actually runs — the caller must be able to tolerate that.
	 */
	hasFreeSeat(): boolean {
		return this.calculatePlaceUnsafe() !== null;
	}

	get seed(): number[] {
		return this._currentDuelRecord.seed;
	}

	get currentDuelRecord(): DuelRecord {
		return this._currentDuelRecord;
	}

	get duelRecords(): DuelRecord[] {
		return this._duelRecords;
	}

	get edoBanListHash(): number {
		return this._edoBanListHash;
	}

	get banListName(): string | null {
		return MercuryBanListMemoryRepository.findByHash(this.banListHash)?.name ?? null;
	}

	waiting(): void {
		// Keep the DuelState label (_state, read by toRoomListDTO and
		// DisconnectHandler) and the actual state object (_roomState, whose
		// handleJoin() decides player-vs-spectator) moving together — every
		// other transition (rps/choosingOrder/dueling/sideDecking) sets _state
		// alongside swapping _roomState, so waiting() must too.
		this._state = DuelState.WAITING;
		this._roomState?.removeAllListener();
		// A room can re-enter waiting after an aborted duel (setDuelFinished,
		// ocgcore error) with both players still seated, isStart="start", and
		// stale isReady flags from the crashed duel. Reset both here so a bare
		// TRY_START can't silently re-arm a new duel — everyone must re-ready
		// deliberately. No-op on first entry (no players seated yet, isStart is
		// already "waiting" from the constructor) and on every other normal
		// waiting() call site (room creation), so this is safe to run
		// unconditionally.
		this.isStart = "waiting";
		this._players.forEach((player) => player.notReady());
		const userProfileRepo = new UserProfilePostgresRepository();
		const admitToRoom = new AdmitToRoom(
			new CredentialResolver(userProfileRepo, new UserAuth(userProfileRepo), this._logger),
			new RoomAdmission(),
			this._logger,
		);
		this._roomState = new YGOProWaitingState(
			admitToRoom,
			this.emitter,
			this._logger,
			new YGOProDeckCreator(this._cardRepository, this._deckRules, this._logger),
			this.createDeckValidator(),
		);
	}

	rps(): void {
		this._state = DuelState.RPS;
		this._roomState?.removeAllListener();
		this._roomState = new YGOProRockPaperScissorState(this.emitter, this._logger);
	}

	choosingOrder(): void {
		this._state = DuelState.CHOOSING_ORDER;
		this._roomState?.removeAllListener();
		this._roomState = new YGOProChoosingOrderState(this.emitter, this._logger);
	}

	dueling(): void {
		// Create the Duel object to track turn count for Tag rotation
		const banList = MercuryBanListMemoryRepository.findByHash(this.banListHash);
		this.createDuel(banList?.name ?? null);

		this._state = DuelState.DUELING;
		this.isStart = "start";
		this._roomState?.removeAllListener();
		this._roomState = new YGOProDuelingState(this, this.emitter, this._logger);
	}

	sideDecking(): void {
		this._state = DuelState.SIDE_DECKING;
		this._roomState?.removeAllListener();
		this._roomState = new YGOProSideDeckingState(
			this.emitter,
			this._logger,
			new YGOProDeckCreator(this._cardRepository, this._deckRules, this._logger),
			this.createDeckValidator(),
			this,
		);
	}

	createSpectatorUnsafe(socket: ISocket, name: string): YGOProClient {
		const position = NetPlayerType.OBSERVER;

		const client = new YGOProClient({
			name,
			socket,
			logger: this._logger,
			position,
			host: false,
			id: null,
			team: Team.SPECTATOR,
			room: this,
		});

		return client;
	}

	// Adapter that lets AdmitToRoom apply its decision on this room without
	// knowing about sockets or wire messages. Captures the connecting socket and
	// player info so the use case only deals in domain values.
	admissionTarget(socket: ISocket, playerInfo: PlayerInfoMessage): AdmissionTarget {
		return {
			league: this.league,
			freeSeat: () => {
				// A watch joiner ("w,<roomId>") asked for the stands: offering it no
				// seat routes the unchanged admission policy to spectator. Only the
				// seat offer is affected — ranked-guest rejection, league checks and
				// the upstream reservation gate all still apply. The stamp is set
				// server-side from the parsed command and scoped to this room's id.
				if (socket.watchForRoomId === this.id) {
					return null;
				}

				const place = this.calculatePlaceUnsafe();
				return place ? new Seat(place.position, place.team) : null;
			},
			seatPlayer: async (credential: PlayerCredential, seat: Seat) => {
				const userId = credential.kind === "guest" ? null : credential.userId;
				const player = this.buildPlayer(socket, playerInfo.name, userId, seat.position, seat.team);
				player.setCredential(credential);
				this.addPlayerUnsafe(player);
			},
			admitSpectator: async (credential: PlayerCredential) => {
				const spectator = this.createSpectatorUnsafe(socket, playerInfo.name);
				spectator.setCredential(credential);
				this.addSpectatorUnsafe(spectator);
			},
			rejectAdmission: () => {
				// A client that supplied a PIN but was still turned away authenticated
				// as a guest — its PIN did not resolve to a valid account (wrong PIN,
				// unknown user, or banned). Tell the player WHY before the generic join
				// error, so a mistyped password isn't an opaque failure. Text is sent as
				// a STOC_CHAT (the ygopro path's mechanism, matching the duel/side states).
				if (playerInfo.password) {
					const chat = new YGOProStocChat().fromPartial({
						player_type: ChatColor.RED,
						msg: "Invalid username or password.",
					});
					socket.send(Buffer.from(chat.toFullPayload()));
				}
				socket.send(this.messageSender.errorMessage(ErrorMessageType.JOINERROR, 0));
				socket.close();
			},
		};
	}

	/**
	 * Reservation gate for the JOIN door, evaluated in EVERY room state. A
	 * reserved room rejects third parties from SEATS, but admits watch-stamped
	 * spectators: seat security is independent from watchability. The join
	 * string alone is deliberately not enough to take a seat in a reserved
	 * room: it travels through client config files and process lists, so a
	 * seat demands a ticket-resolved identity stamped in the reservation set.
	 * A watch-stamped socket ("w,<roomId>") can only ever spectate — the
	 * waiting door offers it no seat and the mid-duel states force its
	 * spectator branch — and spectators see only the opponent view (no hands),
	 * so admitting it grants the stands and nothing more. Internal (bot)
	 * sockets are pre-authorized by their consumed room-bound join token — a
	 * bot carries no user identity to compare. Everything else (non-watch,
	 * non-reserved, non-bot) is still rejected outright. Rooms without
	 * reservations admit everyone, exactly as before.
	 */
	reservationAdmits(socket: ISocket): boolean {
		if (!this.reservedUserIds || this.reservedUserIds.length === 0) {
			return true;
		}
		if (socket.internalForRoomId === this.id) {
			return true;
		}
		// A watch stamp is spectate-only capability, never seat capability:
		// seat-taking paths (spectator -> player promotion) must consult
		// reservationPermitsSeat instead of this gate.
		if (socket.watchForRoomId === this.id) {
			return true;
		}

		if (!socket.resolvedUserId || !this.reservedUserIds.includes(socket.resolvedUserId)) {
			return false;
		}

		return !this.holdsLiveSeat(socket.resolvedUserId);
	}

	/**
	 * Seat-taking form of the reservation check, for paths that hand an
	 * ALREADY-ADMITTED client a seat (spectator -> player promotion via
	 * TO_DUEL). Deliberately distinct from reservationAdmits: the JOIN gate
	 * also admits watch-stamped sockets, and a watch stamp grants the stands
	 * only — reusing it here would let a non-reserved watcher escalate into a
	 * reserved seat during the pre-duel window. Only a ticket-resolved
	 * identity in the reservation set may sit, and — same one-seat-per-identity
	 * rule as the JOIN gate — not while that identity already holds a live
	 * seat: a seated player could otherwise re-enter through the watch door on
	 * a second connection and TO_DUEL into the opponent's still-free seat.
	 * Rooms without reservations permit everyone, exactly as before.
	 */
	reservationPermitsSeat(socket: ISocket): boolean {
		if (!this.reservedUserIds || this.reservedUserIds.length === 0) {
			return true;
		}
		if (!socket.resolvedUserId || !this.reservedUserIds.includes(socket.resolvedUserId)) {
			return false;
		}

		return !this.holdsLiveSeat(socket.resolvedUserId);
	}

	/**
	 * One seat per reserved identity, shared by BOTH reservation gates (JOIN
	 * admission and seat-taking promotion): a user whose seat is still held by
	 * a live socket may not take another, or one player could fill both seats
	 * with two connections and squeeze the opponent out. Seat liveness reads
	 * socket.closed — the same signal the reconnect paths use — so a crashed
	 * player (their seat's socket already closed) can still come back in.
	 */
	private holdsLiveSeat(userId: string): boolean {
		return this._players.some((player) => player.id === userId && !player.socket.closed);
	}

	/**
	 * Turn a non-reserved joiner away: a red STOC_CHAT explaining why, the real
	 * JOINERROR, then a graceful close() so both frames flush before teardown —
	 * the same ygopro-flavored reject sequence as admissionTarget's
	 * rejectAdmission and the waiting state's name-taken path.
	 */
	rejectReservedJoin(socket: ISocket): void {
		const chat = new YGOProStocChat().fromPartial({
			player_type: ChatColor.RED,
			msg: "This room is reserved for its matched players.",
		});
		socket.send(Buffer.from(chat.toFullPayload()));
		socket.send(this.messageSender.errorMessage(ErrorMessageType.JOINERROR, 0));
		socket.close();
	}

	createPlayerUnsafe(socket: ISocket, name: string, userId: string | null): YGOProClient | null {
		const place = this.calculatePlaceUnsafe();
		if (!place) {
			return null;
		}

		return this.buildPlayer(socket, name, userId, place.position, place.team);
	}

	private buildPlayer(
		socket: ISocket,
		name: string,
		userId: string | null,
		position: number,
		team: number,
	): YGOProClient {
		const isHost = !this._players.some((client: YGOProClient) => client.host);

		return new YGOProClient({
			name,
			socket,
			logger: this._logger,
			position,
			host: isHost,
			id: userId,
			team,
			room: this,
		});
	}

	addPlayerUnsafe(player: YGOProClient): void {
		player.sendMessageToClient(
			this._messageRepository.joinGameMessage(this.hostInfo, this.banListHash),
		);
		this._players.push(player);
		player.socket.roomId = this.id;

		player.sendMessageToClient(
			this._messageRepository.typeChangeMessage(player.position, player.host),
		);

		this.clients.forEach((_client: YGOProClient) => {
			const playerEnterMessageBuffer = this._messageRepository.playerEnterMessage(
				_client.name,
				_client.position,
			);
			player.sendMessageToClient(playerEnterMessageBuffer);

			if (_client.deck) {
				const state = _client.isReady ? PlayerChangeState.READY : PlayerChangeState.NOTREADY;
				player.sendMessageToClient(
					this._messageRepository.playerChangeMessage(_client.position, state),
				);
			}
		});

		const playerEnterMessage = this._messageRepository.playerEnterMessage(
			player.name,
			player.position,
		);
		this.clients.forEach((_client: YGOProClient) => {
			if (_client !== player) {
				_client.sendMessageToClient(playerEnterMessage);
			}
		});

		this.sendSpectatorCount({ enqueue: false });
	}

	addSpectatorUnsafe(spectator: YGOProClient): void {
		spectator.sendMessageToClient(
			this._messageRepository.joinGameMessage(this.hostInfo, this.banListHash),
		);

		this._spectators.push(spectator);
		spectator.sendMessageToClient(
			this._messageRepository.typeChangeMessage(spectator.position, spectator.host),
		);

		this.clients.forEach((_client: YGOProClient) => {
			const playerEnterMessageBuffer = this._messageRepository.playerEnterMessage(
				_client.name,
				_client.position,
			);
			spectator.sendMessageToClient(playerEnterMessageBuffer);
			if (_client.deck) {
				const state = _client.isReady ? PlayerChangeState.READY : PlayerChangeState.NOTREADY;
				spectator.sendMessageToClient(
					this._messageRepository.playerChangeMessage(_client.position, state),
				);
			}
		});

		this.sendSpectatorCount({ enqueue: false });
	}

	playerToSpectatorUnsafe(player: YGOProClient): void {
		this.removePlayerUnsafe(player);
		this._spectators.push(player);

		const playerChangeMessageBuffer = this._messageRepository.playerChangeMessage(
			player.position,
			PlayerChangeState.OBSERVE,
		);
		this.broadcastToAll(playerChangeMessageBuffer);

		player.spectatorPosition(NetPlayerType.OBSERVER);
		player.notReady();
		player.sendMessageToClient(
			this._messageRepository.typeChangeMessage(player.position, player.host),
		);
		this.sendSpectatorCount({ enqueue: false });
	}

	spectatorToPlayerUnsafe(player: YGOProClient): void {
		const place = this.calculatePlaceUnsafe();
		if (!place) {
			return;
		}
		this.removeSpectatorUnsafe(player);
		this._players.push(player);

		player.playerPosition(place.position, place.team);
		player.notReady();

		const playerEnterMessageBuffer = this._messageRepository.playerEnterMessage(
			player.name,
			player.position,
		);
		this.broadcastToAll(playerEnterMessageBuffer);

		player.sendMessageToClient(
			this._messageRepository.typeChangeMessage(player.position, player.host),
		);
		this.sendSpectatorCount({ enqueue: false });
	}

	movePlayerToAnotherCellUnsafe(player: YGOProClient): void {
		const nextPlace = this.nextAvailablePosition(player.position);
		if (!nextPlace) {
			return;
		}
		const oldPosition = player.position;
		player.notReady();
		this.broadcastToAll(
			this._messageRepository.playerChangeMessage(oldPosition, nextPlace.position),
		);
		player.playerPosition(nextPlace.position, nextPlace.team);
		this.broadcastToAll(
			this._messageRepository.playerChangeMessage(player.position, PlayerChangeState.NOTREADY),
		);
		player.sendMessageToClient(
			this._messageRepository.typeChangeMessage(player.position, player.host),
		);
	}

	setDecksToPlayer(position: number, deck: Deck): void {
		this.mutex.runExclusive(() => {
			this.setDecksToPlayerUnsafe(position, deck);
		});
	}

	setDecksToPlayerUnsafe(position: number, deck: Deck): void {
		const client = this._players.find((client) => client.position === position);

		if (!client || !(client instanceof YGOProClient)) {
			return;
		}

		client.ready();
		client.setDeck(deck);
		const message = this._messageRepository.playerChangeMessage(
			client.position,
			PlayerChangeState.READY,
		);
		this.broadcastToAll(message);
	}

	notReadyUnsafe(player: YGOProClient): void {
		if (player.position === NetPlayerType.OBSERVER) {
			return;
		}
		player.notReady();
		player.sendMessageToClient(
			this._messageRepository.playerChangeMessage(player.position, PlayerChangeState.NOTREADY),
		);
	}

	sendPreviousDuelsHistoricalMessages(spectator: YGOProClient): void {
		for (const record of this._duelRecords.slice(0, -1)) {
			for (const message of record.toPlayback((msg) => msg.observerView())) {
				spectator.sendMessageToClient(Buffer.from(message.toFullPayload()));
			}
		}
	}

	sendCurrentDuelHistoricalMessages(spectator: YGOProClient): void {
		for (const message of this._currentDuelRecord?.toPlayback((msg) => msg.observerView()) || []) {
			spectator.sendMessageToClient(Buffer.from(message.toFullPayload()));
		}
	}

	currentDuelReplayData(): YGOProYrp | null {
		if (!this._currentDuelRecord) return null;
		return this._currentDuelRecord.toYrp(this);
	}

	sendDeckCountMessage(client: YGOProClient): void {
		const toDeckCount = (deck: Deck | null) => {
			const message = new YGOProStocDeckCount_DeckInfo();
			if (!deck) {
				message.main = 0;
				message.extra = 0;
				message.side = 0;
			} else {
				message.main = deck.main.length;
				message.extra = deck.extra.length;
				message.side = deck.side.length;
			}
			return message;
		};

		const displayCountDecks: (Deck | null)[] = [0, 1].map((team) => {
			const player = this.getTeamPlayers(team)[0];
			return player.deck;
		});

		const team = client.team;
		const deck = displayCountDecks[team];
		const otherDeck = displayCountDecks[1 - team];

		const message = new YGOProStocDeckCount().fromPartial({
			player0DeckCount: toDeckCount(deck),
			player1DeckCount: toDeckCount(otherDeck),
		});

		client.sendMessageToClient(Buffer.from(message.toFullPayload()));
	}

	addDuelRecord(duelRecord: DuelRecord): void {
		this._duelRecords.push(duelRecord);
		this._currentDuelRecord = duelRecord;
	}

	saveMessageToDuelRecord(message: YGOProMsgBase): void {
		this._currentDuelRecord.messages.push(message);
	}

	reconnect(player: YGOProClient, socket: ISocket): void {
		player.socket.removeAllListeners();
		player.setSocket(socket);
		player.reconnecting();
		player.sendMessageToClient(
			this._messageRepository.joinGameMessage(this.hostInfo, this.banListHash),
		);
		const type = player.host ? player.position | 0x10 : player.position;
		player.sendMessageToClient(this._messageRepository.typeChangeMessageFromType(type));
		this._players.forEach((_player: YGOProClient) => {
			const playerEnterMessageBuffer = this._messageRepository.playerEnterMessage(
				_player.name,
				_player.position,
			);
			player.sendMessageToClient(playerEnterMessageBuffer);
		});
	}

	private createDeckValidator(): YGOProDeckValidator {
		const banList = MercuryBanListMemoryRepository.findByHash(this.banListHash);

		return new YGOProDeckValidator(this._deckRules, banList ?? new YGOProBanList());
	}

	toPresentation(): { [key: string]: unknown } {
		const lobbyInfo = getLobbyDuelInfo(this._hostInfo.duel_rule);

		return {
			roomid: this.id,
			roomname: this.name,
			roomnotes: this.ranked ? "(Mercury-Ranked)" : "(Mercury)",
			roommode: this._hostInfo.mode,
			needpass: this.password.length > 0,
			team1: this.team0,
			team2: this.team1,
			best_of: this.bestOf,
			duel_flag: lobbyInfo.duelFlag,
			forbidden_types: lobbyInfo.forbiddenTypes,
			extra_rules: 0,
			start_lp: this._hostInfo.start_lp,
			start_hand: this._hostInfo.start_hand,
			draw_count: this._hostInfo.draw_count,
			time_limit: this._hostInfo.time_limit,
			rule: this._hostInfo.rule,
			no_check: Boolean(this._hostInfo.no_check_deck),
			no_shuffle: Boolean(this._hostInfo.no_shuffle_deck),
			banlist_hash: this._edoBanListHash ?? this.banListHash,
			istart: this.isStart,
			main_min: 40,
			main_max: 60,
			extra_min: 0,
			extra_max: 15,
			side_min: 0,
			side_max: 15,
			users: this._players.map((player) => ({
				name: player.name.replace(/\0/g, "").trim(),
				pos: player.position,
			})),
		};
	}

	toRoomListDTO(): { [key: string]: unknown } {
		const RULE_LABELS: Record<number, string> = {
			0: "OCG",
			1: "TCG",
			2: "OCG/TCG",
			3: "Pre-release",
			4: "Anything Goes",
			5: "Anything Goes",
		};

		const started = this.duelState !== DuelState.WAITING;
		const maxPlayers = this.team0 + this.team1;
		const banList = MercuryBanListMemoryRepository.findByHash(this.banListHash);

		return {
			id: this.id,
			command: this.name,
			status: this.duelState,
			started,
			private: this.password.length > 0,
			canPlay: !started && this._players.length < maxPlayers,
			canWatch: true,
			banlist: banList?.name ?? "No banlist",
			rule: RULE_LABELS[this._hostInfo.rule] ?? "Anything Goes",
			mode: this._hostInfo.mode,
			bestOf: this.bestOf,
			duelRule: this._hostInfo.duel_rule,
			startLp: this._hostInfo.start_lp,
			timeLimit: this._hostInfo.time_limit,
			players: this._players.map((player) => ({
				name: player.name.replace(/\0/g, "").trim(),
				position: player.position,
				team: player.team,
			})),
			maxPlayers,
			spectators: this._spectators.length,
			ranked: this.ranked,
			league: this.league.type,
		};
	}

	// Adds the room's league to the real-time broadcast so the client can place
	// it in the right lobby section (verified / external / casual).
	override toRealTimePresentation(): { [key: string]: unknown } {
		return {
			...super.toRealTimePresentation(),
			league: this.league.type,
		};
	}

	destroy(): void {
		this.emitter.removeAllListeners();
		this._roomState?.removeAllListener();
		this._players.forEach((client: YGOProClient) => {
			client.destroy();
		});
	}

	removeSpectator(spectator: YGOProClient): void {
		this._spectators = this._spectators.filter((item) => item.socket.id !== spectator.socket.id);
	}

	playerLeave(player: YGOProClient): void {
		this.removePlayer(player);
		const message = this.messageSender.playerChangeMessage(
			player.position,
			PlayerChangeState.LEAVE,
		);
		this.broadcastToAll(message);
	}

	spectatorLeave(spectator: YGOProClient): void {
		this.removeSpectator(spectator);
		this.sendSpectatorCount({ enqueue: false });
	}

	setDuelFinished(): void {
		// The ocgcore-error path lands here with the OCGCore still alive inside
		// the (about to be discarded) dueling state. Every other exit from
		// dueling disposes the core before transitioning away (see
		// YGOProDuelingState.finalizeWithReplays / transitionToSideDecking), so
		// this path must too, or the core leaks. Guarded because
		// setDuelFinished can only meaningfully dispose when the CURRENT state
		// actually is a dueling state.
		if (this._roomState instanceof YGOProDuelingState) {
			this._roomState.disposeCore();
		}

		// Delegate to waiting() instead of flipping the _state label alone.
		// Flipping only the label would leave _roomState pointing at the stale
		// dueling state, so a room coming out of a broken duel (ocgcore error in
		// YGOProDuelingState.handleResponse) would look "waiting" in
		// toRoomListDTO while its live JOIN handler still spectated
		// unconditionally. waiting() tears down the old state's listeners AND
		// rearms real player admission (and resets isStart/isReady).
		this.waiting();
	}

	get messageSender(): MessageRepository {
		return this._messageRepository;
	}

	sendSpectatorCount({ enqueue = false }: { enqueue: boolean }): void {
		const message = this._messageRepository.watchChangeMessage(this._spectators.length);
		if (!enqueue) {
			this.broadcastToAll(message);

			return;
		}
		this.mutex.runExclusive(() => {
			this.broadcastToAll(message);
		});
	}

	private broadcastToAll(message: Buffer): void {
		this._players.forEach((client: YGOProClient) => {
			client.sendMessageToClient(message);
		});
		this._spectators.forEach((client: YGOProClient) => {
			client.sendMessageToClient(message);
		});
	}
}
