import { ParticipantMother } from "@test-support/mothers/matchmaking/ParticipantMother";

import { InMemoryPoolStore } from "./InMemoryPoolStore";

describe("InMemoryPoolStore", () => {
	let store: InMemoryPoolStore;

	beforeEach(() => {
		store = new InMemoryPoolStore();
	});

	describe("add and get", () => {
		it("returns the participant that was added, by id", () => {
			const participant = ParticipantMother.create();

			store.add(participant);

			expect(store.get(participant.id)).toBe(participant);
		});

		it("returns undefined for an id that was never added", () => {
			expect(store.get("unknown-id")).toBeUndefined();
		});
	});

	describe("findByUserId", () => {
		it("returns the participant matching the userId", () => {
			const participant = ParticipantMother.create({ userId: "user-1" });

			store.add(participant);

			expect(store.findByUserId("user-1")).toBe(participant);
		});

		it("returns undefined once the participant has been removed", () => {
			const participant = ParticipantMother.create({ userId: "user-2" });
			store.add(participant);

			store.remove(participant.id);

			expect(store.findByUserId("user-2")).toBeUndefined();
		});

		it("returns the winner after a same-user replacement (remove old, then add new)", () => {
			const oldParticipant = ParticipantMother.create({ id: "conn-1", userId: "user-3" });
			const newParticipant = ParticipantMother.create({ id: "conn-2", userId: "user-3" });
			store.add(oldParticipant);

			store.remove(oldParticipant.id);
			store.add(newParticipant);

			expect(store.findByUserId("user-3")).toBe(newParticipant);
			expect(store.get(oldParticipant.id)).toBeUndefined();
			expect(store.get(newParticipant.id)).toBe(newParticipant);
		});
	});

	describe("both indices stay consistent across add and remove", () => {
		it("removes a participant from both the id index and the userId index", () => {
			const participant = ParticipantMother.create({ id: "conn-1", userId: "user-4" });
			store.add(participant);

			store.remove(participant.id);

			expect(store.get("conn-1")).toBeUndefined();
			expect(store.findByUserId("user-4")).toBeUndefined();
		});

		it("removing an unknown id is a no-op and does not throw", () => {
			expect(() => store.remove("unknown-id")).not.toThrow();
		});
	});

	describe("depth", () => {
		it("counts participants per pool key (format+mode)", () => {
			store.add(
				ParticipantMother.create({ id: "a", userId: "u-a", format: "tcg", mode: "ranked" }),
			);
			store.add(
				ParticipantMother.create({ id: "b", userId: "u-b", format: "tcg", mode: "ranked" }),
			);
			store.add(
				ParticipantMother.create({ id: "c", userId: "u-c", format: "jtp", mode: "ranked" }),
			);

			expect(store.depth("tcg", "ranked")).toBe(2);
			expect(store.depth("jtp", "ranked")).toBe(1);
		});

		it("returns zero for a pool key with no participants", () => {
			expect(store.depth("edison", "ranked")).toBe(0);
		});

		it("decreases after a participant in that pool is removed", () => {
			const participant = ParticipantMother.create({
				id: "d",
				userId: "u-d",
				format: "tcg",
				mode: "ranked",
			});
			store.add(participant);

			store.remove(participant.id);

			expect(store.depth("tcg", "ranked")).toBe(0);
		});
	});

	describe("all", () => {
		it("lists every participant currently in a pool key", () => {
			const a = ParticipantMother.create({ id: "a", userId: "u-a", format: "tcg", mode: "ranked" });
			const b = ParticipantMother.create({ id: "b", userId: "u-b", format: "tcg", mode: "ranked" });
			store.add(a);
			store.add(b);

			const result = store.all("tcg", "ranked");

			expect(result).toHaveLength(2);
			expect(result).toEqual(expect.arrayContaining([a, b]));
		});

		it("does not include a participant from a different pool key", () => {
			store.add(
				ParticipantMother.create({ id: "a", userId: "u-a", format: "tcg", mode: "ranked" }),
			);
			store.add(
				ParticipantMother.create({ id: "b", userId: "u-b", format: "jtp", mode: "ranked" }),
			);

			expect(store.all("tcg", "ranked")).toHaveLength(1);
		});
	});
});
