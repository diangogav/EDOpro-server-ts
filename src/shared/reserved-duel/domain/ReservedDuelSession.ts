import { deckHonoursLock } from "./DeckLock";
import { RequiredDeck, Reservation, UserParticipant, WindbotParticipant } from "./Reservation";
import { ReservedDuelAbandon } from "./ReservedDuelRepository";

/**
 * Side effects a reserved room triggers while it lives. Calls are
 * fire-and-forget: a duel never waits on persistence.
 */
export interface ReservedDuelRecorder {
	started(reservationId: string, matchId: string): void;
	abandoned(reservationId: string, abandon: ReservedDuelAbandon): void;
	release(reservationId: string): void;
}

/**
 * The reservation a room was built from, plus the room's progress against it.
 *
 * Exactly one terminal outcome is ever written per reservation: once a game
 * over has been dispatched the result belongs to the game-over subscriber, and
 * closing the room records an abandon only when that never happened.
 */
export class ReservedDuelSession {
	private started = false;
	private gameOver = false;
	private closed = false;

	constructor(
		public readonly reservation: Reservation,
		private readonly recorder: ReservedDuelRecorder,
	) {}

	public get id(): string {
		return this.reservation.id;
	}

	public get isSingle(): boolean {
		return this.reservation.mode === "single";
	}

	public get allowsSpectators(): boolean {
		return this.reservation.options.spectators;
	}

	public get allowsReconnect(): boolean {
		return this.reservation.options.reconnect;
	}

	public get isListed(): boolean {
		return this.reservation.options.listed;
	}

	public get lobbyTimeoutMs(): number {
		return this.reservation.options.lobbyTimeoutSeconds * 1000;
	}

	public get hasStarted(): boolean {
		return this.started;
	}

	public get hasGameOver(): boolean {
		return this.gameOver;
	}

	public get users(): readonly UserParticipant[] {
		return this.reservation.participants.filter(
			(participant): participant is UserParticipant => participant.kind === "user",
		);
	}

	public get bots(): readonly WindbotParticipant[] {
		return this.reservation.participants.filter(
			(participant): participant is WindbotParticipant => participant.kind === "windbot",
		);
	}

	public get userIds(): string[] {
		return this.users.map((user) => user.userId);
	}

	public seatOfUser(userId: string | undefined): number | null {
		return this.users.find((user) => user.userId === userId)?.seat ?? null;
	}

	public botSeat(): number | null {
		return this.bots[0]?.seat ?? null;
	}

	/** Seats with no deck requirement accept any deck the banlist accepts. */
	public acceptsDeck(seat: number, deck: RequiredDeck): boolean {
		const required = this.users.find((user) => user.seat === seat)?.requiredDeck;
		if (!required) {
			return true;
		}

		return deckHonoursLock(this.reservation.options.deckLock, required, deck);
	}

	/** With an exact lock the deck cannot change once the seat is ready. */
	public get locksReadyDeck(): boolean {
		return this.reservation.options.deckLock === "exact";
	}

	/**
	 * Which seat to blame when the lobby times out: the first human seat that
	 * never sat, else the first human seat that never readied. Null when every
	 * human is there and ready, so only a bot is missing.
	 */
	public noShowSeat(seated: readonly number[], ready: readonly number[]): number | null {
		const absent = this.users.find((user) => !seated.includes(user.seat));
		if (absent) {
			return absent.seat;
		}

		return this.users.find((user) => !ready.includes(user.seat))?.seat ?? null;
	}

	public markStarted(matchId: string): void {
		if (this.started) {
			return;
		}
		this.started = true;
		this.recorder.started(this.id, matchId);
	}

	public markGameOver(): void {
		this.gameOver = true;
	}

	/** Called once when the room is torn down. */
	public close(abandon: ReservedDuelAbandon): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		if (!this.gameOver) {
			// The start write runs in the background and may land after this
			// abandon; carrying the flag keeps a quick quit counted as started.
			this.recorder.abandoned(this.id, this.started ? { ...abandon, started: true } : abandon);
		}
		this.recorder.release(this.id);
	}
}
