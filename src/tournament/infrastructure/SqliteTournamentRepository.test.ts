import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DataSource } from "typeorm";

import { TournamentMother } from "@test-support/mothers/tournament/TournamentMother";

import { TournamentService } from "../application/TournamentService";
import { buildTournamentDataSource } from "./data-source";
import {
	MAX_ACTIVE_TOURNAMENTS_PER_ORGANIZER,
	SqliteTournamentRepository,
} from "./SqliteTournamentRepository";

describe("SqliteTournamentRepository", () => {
	let folder: string;
	let sources: DataSource[];
	const open = () => {
		const source = buildTournamentDataSource(join(folder, "brackets.sqlite"));
		sources.push(source);
		return new SqliteTournamentRepository(source);
	};
	beforeEach(async () => {
		folder = await mkdtemp(join(tmpdir(), "evolution-tournament-"));
		sources = [];
	});
	afterEach(async () => {
		for (const source of sources) if (source.isInitialized) await source.destroy();
		await rm(folder, { recursive: true, force: true });
	});

	it("applies its generated migration and preserves documents after closing and reopening the database", async () => {
		const repository = open();
		const original = TournamentMother.create().toPrimitives();
		await repository.create(original);
		expect(await sources[0].showMigrations()).toBe(false);
		await sources[0].destroy();
		expect(await open().find(original.id)).toEqual(original);
	});

	it("atomically caps concurrent creates by the same organizer", async () => {
		const repository = open();
		const attempts = await Promise.allSettled(
			Array.from({ length: MAX_ACTIVE_TOURNAMENTS_PER_ORGANIZER + 2 }, () =>
				repository.create(TournamentMother.create({ organizerId: "same-owner" }).toPrimitives()),
			),
		);
		expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(
			MAX_ACTIVE_TOURNAMENTS_PER_ORGANIZER,
		);
		const rejected = attempts.filter(
			(attempt) => attempt.status === "rejected",
		) as PromiseRejectedResult[];
		expect(rejected).toHaveLength(2);
		expect(rejected.every((attempt) => attempt.reason.code === "capacity")).toBe(true);
	});

	it("permits only one concurrent roster mutation across independent connections", async () => {
		const first = open(),
			second = open();
		const original = TournamentMother.create().toPrimitives();
		await first.create(original);
		await second.initialize();
		const states = [structuredClone(original), structuredClone(original)];
		states[0].revision = states[1].revision = 1;
		states[0].name = "first";
		states[1].name = "second";
		const attempts = await Promise.allSettled([
			first.save(states[0], 0),
			second.save(states[1], 0),
		]);
		expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
		expect(attempts.find((attempt) => attempt.status === "rejected")).toMatchObject({
			reason: { code: "conflict" },
		});
		expect((await second.find(original.id))?.revision).toBe(1);
	});

	it("keeps cancelled history while releasing the active organizer quota", async () => {
		const repository = open();
		const service = new TournamentService(repository);
		const original = await service.create("owner", {
			name: "Normal players",
			format: "tcg",
			bestOf: 3,
			capacity: 8,
		});
		await service.cancel(original.id, "owner", 0, "Cancelled");
		for (let index = 0; index < MAX_ACTIVE_TOURNAMENTS_PER_ORGANIZER; index++)
			await repository.create(TournamentMother.create({ organizerId: "owner" }).toPrimitives());
		expect((await repository.find(original.id))?.status).toBe("cancelled");
	});

	it("rejects relative database paths instead of silently changing storage with the working directory", () => {
		expect(() => buildTournamentDataSource("brackets.sqlite")).toThrow("absolute path");
	});
});
