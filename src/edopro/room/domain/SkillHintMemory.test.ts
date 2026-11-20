import { SkillHintMemory } from "./SkillHintMemory";

const hint = (type: number, player: number, low = 0, high = 0): Buffer => {
	const frame = Buffer.alloc(14);
	frame.writeUInt16LE(12, 0);
	frame[2] = 0x01;
	frame[3] = 0x02;
	frame[4] = type;
	frame[5] = player;
	frame.writeUInt32LE(low, 6);
	frame.writeUInt32LE(high, 10);

	return frame;
};

describe("SkillHintMemory", () => {
	const owner = { name: "owner" };
	const rival = { name: "rival" };

	it("gives back the Skill hints a player was sent, in arrival order", () => {
		const memory = new SkillHintMemory();
		const code = hint(200, 0, 300202002);
		const cover = hint(201, 0, 300000007);
		const flip = hint(202, 0, 300202002, 1);
		memory.note(owner, code);
		memory.note(owner, cover);
		memory.note(owner, flip);

		expect(memory.framesFor(owner)).toEqual([code, cover, flip]);
	});

	it("keeps only what each player was sent, so a Skill's code stays with its owner", () => {
		const memory = new SkillHintMemory();
		const code = hint(200, 0, 300202002);
		const cover = hint(201, 0, 300000007);
		memory.note(owner, code);
		memory.note(owner, cover);
		memory.note(rival, cover);

		expect(memory.framesFor(rival)).toEqual([cover]);
	});

	it("keeps the latest flip of a Skill, after the hints that came before it", () => {
		const memory = new SkillHintMemory();
		const cover = hint(201, 0, 300000007);
		const toFace = hint(202, 0, 300202002, 1);
		const toCover = hint(202, 0, 300202002, 2);
		memory.note(owner, toFace);
		memory.note(owner, cover);
		memory.note(owner, toCover);

		expect(memory.framesFor(owner)).toEqual([cover, toCover]);
	});

	it("keeps the Skills of both players apart", () => {
		const memory = new SkillHintMemory();
		const mine = hint(201, 0, 300000007);
		const theirs = hint(201, 1, 300000003);
		memory.note(owner, mine);
		memory.note(owner, theirs);

		expect(memory.framesFor(owner)).toEqual([mine, theirs]);
	});

	it("forgets a Skill that was removed", () => {
		const memory = new SkillHintMemory();
		memory.note(owner, hint(200, 0, 300202002));
		memory.note(owner, hint(201, 0, 300000007));
		memory.note(owner, hint(203, 0));

		expect(memory.framesFor(owner)).toEqual([]);
	});

	it("ignores hints that are not about a Skill and other messages", () => {
		const memory = new SkillHintMemory();
		const draw = Buffer.from("0400015a0001", "hex");
		memory.note(owner, hint(3, 0, 500));
		memory.note(owner, draw);

		expect(memory.framesFor(owner)).toEqual([]);
	});

	it("has nothing for a player who was sent no Skill hint", () => {
		expect(new SkillHintMemory().framesFor(owner)).toEqual([]);
	});
});
