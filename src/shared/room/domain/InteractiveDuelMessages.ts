import { Team } from "../Team";

const THRESHOLD_MESSAGES = {
	3: [
		"Breathe... this is only the beginning.",
		"The duel has only just begun.",
		"Stay calm. This is still your fight.",
		"You have taken the first blow. Stand firm.",
	],
	2: [
		"Things are getting serious...",
		"Now the duel starts to hurt.",
		"This is where pressure begins.",
		"One mistake now can change everything.",
	],
	1: [
		"There is no room for mistakes.",
		"Every choice matters from now on.",
		"You are walking on thin ice now.",
		"Your margin for error is gone.",
	],
	0: [
		"You cannot afford to fail now.",
		"One wrong step could end it all.",
		"This is where legends survive.",
		"The edge of defeat is right beneath you.",
	],
} as const;

const SUB_1000_ENTRY_MESSAGES = [
	"This is all or nothing.",
	"You are one hit away from defeat...",
	"Everything is decided here.",
	"You are standing on the final line.",
	"One breath separates you from defeat.",
	"Now it is survival, nothing else.",
] as const;

const BIG_DAMAGE_GENERAL_MESSAGES = [
	"You are against the ropes, buddy!",
	"That hit shook your whole game.",
	"You just took a brutal hit.",
	"That damage changes everything.",
	"You felt that one, didn't you?",
	"The pressure is crushing down on you.",
] as const;

const BIG_DAMAGE_LOW_LP_MESSAGES = [
	"Now you are really screwed!! Start praying!!",
	"That blow may have sealed your fate.",
	"You are barely holding together now.",
	"The duel is slipping away from you.",
	"You are in real danger now.",
	"One more hit like that and it is over.",
] as const;

const BIG_DAMAGE_CRITICAL_LP_MESSAGES = [
	"You are done for!!",
	"You are hanging by a thread.",
	"You are one touch away from defeat.",
	"This duel is almost over for you.",
	"You are staring defeat in the face.",
	"There is almost nothing left of you now.",
] as const;

const CRITICAL_DROP_MESSAGES = [
	"One wrong move and the duel is over!!",
	"You just fell into the danger zone.",
	"The duel can end at any moment now.",
	"You are one mistake away from losing it all.",
	"This is the most dangerous moment of the duel.",
	"The next hit could be your last.",
] as const;

const LOW_LP_SURVIVAL_MESSAGES = [
	"One more turn to live!!",
	"You survived another turn somehow.",
	"You are still standing. Barely.",
	"Another turn, another chance.",
	"You are not dead yet. Keep moving.",
	"You bought yourself one more turn.",
] as const;

const LOW_LP_HOLD_ON_MESSAGES = [
	"Keep holding on!!",
	"Do not let go now.",
	"Stay in the duel.",
	"Hold the line a little longer.",
	"You are still in this fight.",
	"Do not break now.",
] as const;

const RECOVERY_MESSAGES = [
	"You are not finished yet!!",
	"You found a way to breathe again.",
	"That recovery keeps you alive.",
	"You are fighting your way back.",
	"Hope returns to your side.",
	"You just gave yourself another chance.",
] as const;

const OPPONENT_UNDER_4000_MESSAGES = [
	"You have broken through their guard.",
	"Your opponent is losing control now.",
	"The duel is leaning your way now.",
	"You have pushed your opponent into real danger.",
] as const;

const OPPONENT_UNDER_2000_MESSAGES = [
	"Your opponent is cornered now.",
	"One more clean hit could break them.",
	"They are running out of room.",
	"You have pushed them into danger.",
] as const;

const OPPONENT_UNDER_1000_MESSAGES = [
	"Victory is within reach.",
	"Your opponent is hanging by a thread.",
	"This is your chance to finish it.",
	"One more strike may end everything.",
] as const;

type MessagePoolKey =
	| "threshold_8000_6000"
	| "threshold_6000_4000"
	| "threshold_4000_2000"
	| "threshold_2000_1000"
	| "sub_1000_entry"
	| "big_damage_general"
	| "big_damage_low_lp"
	| "big_damage_critical_lp"
	| "critical_drop"
	| "low_lp_survival"
	| "low_lp_hold_on"
	| "recovery"
	| "opponent_under_4000"
	| "opponent_under_2000"
	| "opponent_under_1000";

type TeamState = {
	lastLp: number;
	damageTakenThisTurn: number;
	hasSentBigDamageMessageThisTurn: boolean;
	hasSentCriticalDropMessageThisTurn: boolean;
	lastRecoveryTurn: number | null;
	lastSub1000TurnMessage: number | null;
	lastLowLpTurnMessage: number | null;
	wasUnder1000: boolean;
	triggeredThresholdBands: Set<number>;
	lastMessageIndexes: Partial<Record<MessagePoolKey, number>>;
};

type TeamMessage = {
	team: Team;
	message: string;
};

export class InteractiveDuelMessages {
	private readonly states: Record<Team.PLAYER | Team.OPPONENT, TeamState>;

	constructor(private readonly startLp: number) {
		this.states = {
			[Team.PLAYER]: this.createInitialState(),
			[Team.OPPONENT]: this.createInitialState(),
		};
	}

	reset(): void {
		this.states[Team.PLAYER] = this.createInitialState();
		this.states[Team.OPPONENT] = this.createInitialState();
	}

	handleDamage(team: Team, amount: number, currentTurn: number, currentLp: number): string | null {
		if (!this.isPlayableTeam(team)) {
			return null;
		}

		const state = this.states[team];
		const previousLp = state.lastLp;
		state.lastLp = currentLp;
		state.damageTakenThisTurn += amount;

		const criticalDropMessage = this.resolveCriticalDropMessage(state, previousLp, currentLp);
		if (criticalDropMessage) {
			this.markCrossedThresholdBands(state, previousLp, currentLp);
			if (state.damageTakenThisTurn >= 2000) {
				state.hasSentBigDamageMessageThisTurn = true;
			}
			state.wasUnder1000 = currentLp < 1000;

			return criticalDropMessage;
		}

		const lowLpMessage = this.resolveSub1000EntryMessage(state, currentTurn, currentLp);
		if (lowLpMessage) {
			this.markCrossedThresholdBands(state, previousLp, currentLp);
			if (state.damageTakenThisTurn >= 2000) {
				state.hasSentBigDamageMessageThisTurn = true;
			}
			state.wasUnder1000 = true;

			return lowLpMessage;
		}

		const thresholdMessage = this.resolveThresholdMessage(state, previousLp, currentLp);
		if (thresholdMessage) {
			if (state.damageTakenThisTurn >= 2000) {
				state.hasSentBigDamageMessageThisTurn = true;
			}
			state.wasUnder1000 = currentLp < 1000;

			return thresholdMessage;
		}

		const bigDamageMessage = this.resolveBigDamageMessage(state, currentLp);
		if (bigDamageMessage) {
			this.markCrossedThresholdBands(state, previousLp, currentLp);
			state.wasUnder1000 = currentLp < 1000;

			return bigDamageMessage;
		}

		state.wasUnder1000 = currentLp < 1000;

		return null;
	}

	handleLpCost(team: Team, currentTurn: number, currentLp: number): string | null {
		if (!this.isPlayableTeam(team)) {
			return null;
		}

		const state = this.states[team];
		const previousLp = state.lastLp;
		state.lastLp = currentLp;

		const criticalDropMessage = this.resolveCriticalDropMessage(state, previousLp, currentLp);
		if (criticalDropMessage) {
			this.markCrossedThresholdBands(state, previousLp, currentLp);
			state.wasUnder1000 = currentLp < 1000;

			return criticalDropMessage;
		}

		const lowLpMessage = this.resolveSub1000EntryMessage(state, currentTurn, currentLp);
		if (lowLpMessage) {
			this.markCrossedThresholdBands(state, previousLp, currentLp);
			state.wasUnder1000 = true;

			return lowLpMessage;
		}

		const thresholdMessage = this.resolveThresholdMessage(state, previousLp, currentLp);
		state.wasUnder1000 = currentLp < 1000;

		return thresholdMessage;
	}

	handleRecover(team: Team, currentTurn: number, currentLp: number): string | null {
		if (!this.isPlayableTeam(team)) {
			return null;
		}

		const state = this.states[team];
		state.lastLp = currentLp;
		state.wasUnder1000 = currentLp < 1000;

		if (state.lastRecoveryTurn === currentTurn) {
			return null;
		}

		state.lastRecoveryTurn = currentTurn;

		return this.pickRandomMessage(state, "recovery", RECOVERY_MESSAGES);
	}

	handleNewTurn(currentTurn: number): TeamMessage[] {
		const messages: TeamMessage[] = [];

		for (const team of [Team.PLAYER, Team.OPPONENT] as const) {
			const state = this.states[team];
			state.damageTakenThisTurn = 0;
			state.hasSentBigDamageMessageThisTurn = false;
			state.hasSentCriticalDropMessageThisTurn = false;

			if (state.lastLp <= 0) {
				continue;
			}

			if (state.lastLp < 1000 && state.lastSub1000TurnMessage !== currentTurn) {
				state.lastSub1000TurnMessage = currentTurn;
				messages.push({
					team,
					message: this.pickRandomMessage(state, "low_lp_survival", LOW_LP_SURVIVAL_MESSAGES),
				});

				continue;
			}

			if (state.lastLp < 2000 && state.lastLowLpTurnMessage !== currentTurn) {
				state.lastLowLpTurnMessage = currentTurn;
				messages.push({
					team,
					message: this.pickRandomMessage(state, "low_lp_hold_on", LOW_LP_HOLD_ON_MESSAGES),
				});
			}
		}

		return messages;
	}

	private createInitialState(): TeamState {
		return {
			lastLp: this.startLp,
			damageTakenThisTurn: 0,
			hasSentBigDamageMessageThisTurn: false,
			hasSentCriticalDropMessageThisTurn: false,
			lastRecoveryTurn: null,
			lastSub1000TurnMessage: null,
			lastLowLpTurnMessage: null,
			wasUnder1000: false,
			triggeredThresholdBands: new Set<number>(),
			lastMessageIndexes: {},
		};
	}

	private isPlayableTeam(team: Team): team is Team.PLAYER | Team.OPPONENT {
		return team === Team.PLAYER || team === Team.OPPONENT;
	}

	private resolveBigDamageMessage(state: TeamState, currentLp: number): string | null {
		if (state.damageTakenThisTurn < 2000 || state.hasSentBigDamageMessageThisTurn) {
			return null;
		}

		state.hasSentBigDamageMessageThisTurn = true;

		if (currentLp < 1000) {
			return this.pickRandomMessage(
				state,
				"big_damage_critical_lp",
				BIG_DAMAGE_CRITICAL_LP_MESSAGES
			);
		}

		if (currentLp < 2000) {
			return this.pickRandomMessage(state, "big_damage_low_lp", BIG_DAMAGE_LOW_LP_MESSAGES);
		}

		return this.pickRandomMessage(state, "big_damage_general", BIG_DAMAGE_GENERAL_MESSAGES);
	}

	private resolveCriticalDropMessage(
		state: TeamState,
		previousLp: number,
		currentLp: number
	): string | null {
		if (state.hasSentCriticalDropMessageThisTurn) {
			return null;
		}

		if (previousLp >= 2000 && currentLp < 2000) {
			state.hasSentCriticalDropMessageThisTurn = true;

			return this.pickRandomMessage(state, "critical_drop", CRITICAL_DROP_MESSAGES);
		}

		return null;
	}

	private resolveSub1000EntryMessage(
		state: TeamState,
		_currentTurn: number,
		currentLp: number
	): string | null {
		if (state.wasUnder1000 || currentLp >= 1000) {
			return null;
		}

		return this.pickRandomMessage(state, "sub_1000_entry", SUB_1000_ENTRY_MESSAGES);
	}

	private resolveThresholdMessage(
		state: TeamState,
		previousLp: number,
		currentLp: number
	): string | null {
		if (currentLp < 1000) {
			return null;
		}

		const band = this.resolveThresholdBand(currentLp);
		if (band === null) {
			return null;
		}

		if (state.triggeredThresholdBands.has(band)) {
			return null;
		}

		return this.bandMessage(state, band);
	}

	private markCrossedThresholdBands(state: TeamState, previousLp: number, currentLp: number): void {
		const bandThresholds = [
			{ threshold: 2000, band: 0 },
			{ threshold: 4000, band: 1 },
			{ threshold: 6000, band: 2 },
			{ threshold: 8000, band: 3 },
		] as const;

		bandThresholds.forEach(({ threshold, band }) => {
			if (previousLp >= threshold && currentLp < threshold) {
				state.triggeredThresholdBands.add(band);
			}
		});
	}

	private resolveThresholdBand(lps: number): number | null {
		if (lps < 1000) {
			return null;
		}

		if (lps < 2000) {
			return 0;
		}

		if (lps < 4000) {
			return 1;
		}

		if (lps < 6000) {
			return 2;
		}

		if (lps < 8000) {
			return 3;
		}

		return null;
	}

	private bandMessage(state: TeamState, band: number): string {
		switch (band) {
			case 3:
				return this.pickRandomMessage(state, "threshold_8000_6000", THRESHOLD_MESSAGES[3]);
			case 2:
				return this.pickRandomMessage(state, "threshold_6000_4000", THRESHOLD_MESSAGES[2]);
			case 1:
				return this.pickRandomMessage(state, "threshold_4000_2000", THRESHOLD_MESSAGES[1]);
			case 0:
				return this.pickRandomMessage(state, "threshold_2000_1000", THRESHOLD_MESSAGES[0]);
			default:
				return "";
		}
	}

	handleOpponentLpDrop(playerTeam: Team, previousOpponentLp: number, currentOpponentLp: number): string | null {
		if (!this.isPlayableTeam(playerTeam)) {
			return null;
		}

		const state = this.states[playerTeam];

		if (previousOpponentLp >= 1000 && currentOpponentLp < 1000) {
			return this.pickRandomMessage(
				state,
				"opponent_under_1000",
				OPPONENT_UNDER_1000_MESSAGES
			);
		}

		if (previousOpponentLp >= 2000 && currentOpponentLp < 2000) {
			return this.pickRandomMessage(
				state,
				"opponent_under_2000",
				OPPONENT_UNDER_2000_MESSAGES
			);
		}

		if (previousOpponentLp > 4000 && currentOpponentLp <= 4000) {
			return this.pickRandomMessage(
				state,
				"opponent_under_4000",
				OPPONENT_UNDER_4000_MESSAGES
			);
		}

		return null;
	}

	private pickRandomMessage(
		state: TeamState,
		key: MessagePoolKey,
		messages: readonly string[]
	): string {
		if (messages.length === 1) {
			state.lastMessageIndexes[key] = 0;

			return messages[0];
		}

		const previousIndex = state.lastMessageIndexes[key];
		let nextIndex = Math.floor(Math.random() * messages.length);

		if (previousIndex !== undefined) {
			while (nextIndex === previousIndex) {
				nextIndex = Math.floor(Math.random() * messages.length);
			}
		}

		state.lastMessageIndexes[key] = nextIndex;

		return messages[nextIndex];
	}
}
