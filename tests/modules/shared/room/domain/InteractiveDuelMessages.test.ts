import { Team } from "../../../../../src/shared/room/Team";
import { InteractiveDuelMessages } from "../../../../../src/shared/room/domain/InteractiveDuelMessages";

const THRESHOLD_8000_6000 = [
	"Breathe... this is only the beginning.",
	"The duel has only just begun.",
	"Stay calm. This is still your fight.",
	"You have taken the first blow. Stand firm.",
];

const THRESHOLD_6000_4000 = [
	"Things are getting serious...",
	"Now the duel starts to hurt.",
	"This is where pressure begins.",
	"One mistake now can change everything.",
];

const BIG_DAMAGE_GENERAL = [
	"You are against the ropes, buddy!",
	"That hit shook your whole game.",
	"You just took a brutal hit.",
	"That damage changes everything.",
	"You felt that one, didn't you?",
	"The pressure is crushing down on you.",
];

const BIG_DAMAGE_LOW_LP = [
	"Now you are really screwed!! Start praying!!",
	"That blow may have sealed your fate.",
	"You are barely holding together now.",
	"The duel is slipping away from you.",
	"You are in real danger now.",
	"One more hit like that and it is over.",
];

const BIG_DAMAGE_CRITICAL_LP = [
	"You are done for!!",
	"You are hanging by a thread.",
	"You are one touch away from defeat.",
	"This duel is almost over for you.",
	"You are staring defeat in the face.",
	"There is almost nothing left of you now.",
];

const LOW_LP_HOLD_ON = [
	"Keep holding on!!",
	"Do not let go now.",
	"Stay in the duel.",
	"Hold the line a little longer.",
	"You are still in this fight.",
	"Do not break now.",
];

const LOW_LP_SURVIVAL = [
	"One more turn to live!!",
	"You survived another turn somehow.",
	"You are still standing. Barely.",
	"Another turn, another chance.",
	"You are not dead yet. Keep moving.",
	"You bought yourself one more turn.",
];

const RECOVERY_MESSAGES = [
	"You are not finished yet!!",
	"You found a way to breathe again.",
	"That recovery keeps you alive.",
	"You are fighting your way back.",
	"Hope returns to your side.",
	"You just gave yourself another chance.",
];

const OPPONENT_UNDER_4000_MESSAGES = [
	"You have broken through their guard.",
	"Your opponent is losing control now.",
	"The duel is leaning your way now.",
	"You have pushed your opponent into real danger.",
];

const OPPONENT_UNDER_2000_MESSAGES = [
	"Your opponent is cornered now.",
	"One more clean hit could break them.",
	"They are running out of room.",
	"You have pushed them into danger.",
];

const OPPONENT_UNDER_1000_MESSAGES = [
	"Victory is within reach.",
	"Your opponent is hanging by a thread.",
	"This is your chance to finish it.",
	"One more strike may end everything.",
];

describe("InteractiveDuelMessages", () => {
	it("should send threshold messages only when entering a lower LP band", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(THRESHOLD_8000_6000).toContain(
			messages.handleDamage(Team.PLAYER, 500, 0, 7500)
		);
		expect(messages.handleDamage(Team.PLAYER, 200, 0, 7300)).toBeNull();
		expect(THRESHOLD_6000_4000).toContain(
			messages.handleDamage(Team.PLAYER, 1800, 0, 5500)
		);
	});

	it("should send a winning message when the opponent drops to 4000 or less", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(OPPONENT_UNDER_4000_MESSAGES).toContain(
			messages.handleOpponentLpDrop(Team.PLAYER, 4500, 4000)
		);
	});

	it("should use LP severity as fallback for the old hand-based big damage variants", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(BIG_DAMAGE_LOW_LP).toContain(
			messages.handleDamage(Team.PLAYER, 6500, 0, 1500)
		);
	});

	it("should not emit delayed threshold messages after a high-priority drop", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(BIG_DAMAGE_LOW_LP).toContain(
			messages.handleDamage(Team.PLAYER, 6500, 0, 1500)
		);
		expect(messages.handleLpCost(Team.PLAYER, 0, 1400)).toBeNull();
	});

	it("should send the strongest big-damage message under 1000 LP", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(BIG_DAMAGE_CRITICAL_LP).toContain(
			messages.handleDamage(Team.PLAYER, 7200, 0, 800)
		);
	});

	it("should send a single entry message when entering sub-1000 LP", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(BIG_DAMAGE_CRITICAL_LP).toContain(
			messages.handleDamage(Team.PLAYER, 7100, 0, 900)
		);
		expect(messages.handleLpCost(Team.PLAYER, 0, 800)).toBeNull();
	});

	it("should send persistent low-LP messages once per turn", () => {
		const messages = new InteractiveDuelMessages(8000);

		messages.handleDamage(Team.PLAYER, 6500, 0, 1500);

		expect(LOW_LP_HOLD_ON).toContain(messages.handleNewTurn(1)[0].message);
		expect(messages.handleNewTurn(1)).toEqual([]);
		expect(LOW_LP_HOLD_ON).toContain(messages.handleNewTurn(2)[0].message);
	});

	it("should send sub-1000 survival messages every turn while still alive", () => {
		const messages = new InteractiveDuelMessages(8000);

		messages.handleLpCost(Team.PLAYER, 0, 900);

		expect(LOW_LP_SURVIVAL).toContain(messages.handleNewTurn(1)[0].message);
		expect(LOW_LP_SURVIVAL).toContain(messages.handleNewTurn(2)[0].message);
	});

	it("should not send encouragement messages when LP are already 0", () => {
		const messages = new InteractiveDuelMessages(8000);

		messages.handleDamage(Team.PLAYER, 8000, 0, 0);

		expect(messages.handleNewTurn(1)).toEqual([]);
	});

	it("should send recovery messages once per turn", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(RECOVERY_MESSAGES).toContain(
			messages.handleRecover(Team.PLAYER, 1, 4500)
		);
		expect(messages.handleRecover(Team.PLAYER, 1, 5000)).toBeNull();
		expect(RECOVERY_MESSAGES).toContain(
			messages.handleRecover(Team.PLAYER, 2, 5200)
		);
	});

	it("should send a winning message when the opponent drops below 1000", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(OPPONENT_UNDER_1000_MESSAGES).toContain(
			messages.handleOpponentLpDrop(Team.PLAYER, 1200, 800)
		);
	});

	it("should prioritize the lowest opponent threshold reached", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(OPPONENT_UNDER_1000_MESSAGES).toContain(
			messages.handleOpponentLpDrop(Team.PLAYER, 4500, 800)
		);
	});

	it("should send a winning message when the opponent drops below 2000", () => {
		const messages = new InteractiveDuelMessages(8000);

		expect(OPPONENT_UNDER_2000_MESSAGES).toContain(
			messages.handleOpponentLpDrop(Team.PLAYER, 2500, 1500)
		);
	});
});
