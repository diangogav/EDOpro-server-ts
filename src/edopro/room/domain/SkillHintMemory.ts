const COMMAND_OFFSET = 2;
const MESSAGE_OFFSET = 3;
const HINT_TYPE_OFFSET = 4;
const HINT_PLAYER_OFFSET = 5;
const STOC_GAME_MSG = 0x01;
const MSG_HINT = 0x02;
const HINT_SKILL = 200;
const HINT_SKILL_REMOVE = 203;

/**
 * The Skill hints each player of a Speed Duel was sent, so a player who comes
 * back gets its Skill slots again. A Skill is in no zone: the core shows it
 * only through hints (its code, its cover, a flip, its removal), and no field
 * snapshot carries it.
 *
 * It remembers what each player was actually sent, because the Skill's code
 * goes to its owner alone. Per Skill it keeps the latest hint of each kind, in
 * the order they arrived; a removal forgets the Skill.
 */
export class SkillHintMemory<Recipient extends object> {
	private readonly hints = new Map<Recipient, Map<number, Map<number, Buffer>>>();

	/** Records `frame` when it is a Skill hint sent to `recipient`. */
	public note(recipient: Recipient, frame: Buffer): void {
		if (!SkillHintMemory.isSkillHint(frame)) {
			return;
		}
		const type = frame[HINT_TYPE_OFFSET];
		const owner = frame[HINT_PLAYER_OFFSET];
		const skills = this.hints.get(recipient) ?? new Map<number, Map<number, Buffer>>();
		this.hints.set(recipient, skills);
		if (type === HINT_SKILL_REMOVE) {
			skills.delete(owner);

			return;
		}
		const kinds = skills.get(owner) ?? new Map<number, Buffer>();
		skills.set(owner, kinds);
		// Deleting first moves the kind to the end, which keeps arrival order.
		kinds.delete(type);
		kinds.set(type, frame);
	}

	/** The frames that bring `recipient`'s Skill slots back, in the order to send them. */
	public framesFor(recipient: Recipient): Buffer[] {
		const skills = this.hints.get(recipient);
		if (!skills) {
			return [];
		}

		return [...skills.values()].flatMap((kinds) => [...kinds.values()]);
	}

	private static isSkillHint(frame: Buffer): boolean {
		return (
			frame.length > HINT_PLAYER_OFFSET &&
			frame[COMMAND_OFFSET] === STOC_GAME_MSG &&
			frame[MESSAGE_OFFSET] === MSG_HINT &&
			frame[HINT_TYPE_OFFSET] >= HINT_SKILL &&
			frame[HINT_TYPE_OFFSET] <= HINT_SKILL_REMOVE
		);
	}
}
