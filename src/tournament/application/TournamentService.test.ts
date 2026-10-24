import { mock } from "jest-mock-extended";

import { TournamentMother } from "@test-support/mothers/tournament/TournamentMother";

import { TournamentRepository } from "../domain/TournamentRepository";
import { TournamentService } from "./TournamentService";

describe("TournamentService", () => {
	it("refuses a stale roster write without saving it", async () => {
		const repository = mock<TournamentRepository>();
		const tournament = TournamentMother.create().toPrimitives();
		tournament.revision = 4;
		repository.find.mockResolvedValue(tournament);
		const service = new TournamentService(repository);
		await expect(service.join(tournament.id, "alice", 3, "Alice", null)).rejects.toMatchObject({
			code: "conflict",
		});
		expect(repository.save).not.toHaveBeenCalled();
	});

	it("acknowledges an exact result retry even when its original revision is stale", async () => {
		const repository = mock<TournamentRepository>();
		const tournament = TournamentMother.create({ organizerId: "owner" });
		for (const id of ["a", "b"])
			tournament.join({ id, userId: id, displayName: id, characterId: null });
		tournament.start("owner");
		tournament.report("owner", "r1m1", 2, 1, "2026-10-18T13:00:00Z");
		tournament.advanceRevision("2026-10-18T13:00:00Z");
		repository.find.mockResolvedValue(tournament.toPrimitives());
		const service = new TournamentService(repository);
		const retry = await service.report(tournament.toPrimitives().id, "owner", 0, "r1m1", 2, 1);
		expect(retry.revision).toBe(1);
		expect(repository.save).not.toHaveBeenCalled();
		await expect(service.report(retry.id, "intruder", 0, "r1m1", 2, 1)).rejects.toMatchObject({
			code: "forbidden",
		});
	});
});
