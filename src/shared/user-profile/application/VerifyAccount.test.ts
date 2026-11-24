import bcrypt from "bcrypt";

import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { UserProfileMother } from "@test-support/mothers/user-profile/UserProfileMother";

import { VerifyAccount } from "./VerifyAccount";

const CUTOFF = new Date("2026-11-25T00:00:00Z");
const PIN = "1234";
const PIN_HASH = bcrypt.hashSync(PIN, 4);

const playerInfo = (name: string, password: string | null): PlayerInfoMessage =>
	({ name, password }) as unknown as PlayerInfoMessage;

const verifiedProfile = UserProfileMother.create({
	id: "u-verified",
	username: "Verified",
	password: PIN_HASH,
	emailVerifiedAt: new Date("2026-11-24T00:00:00Z"),
	createdAt: new Date("2026-11-30T00:00:00Z"),
});

const unverifiedProfile = UserProfileMother.create({
	id: "u-unverified",
	username: "Unverified",
	password: PIN_HASH,
	emailVerifiedAt: null,
	discordId: null,
	createdAt: new Date("2026-11-30T00:00:00Z"),
});

describe("VerifyAccount", () => {
	let repo: jest.Mocked<UserProfileRepository>;
	let verifyAccount: VerifyAccount;

	beforeEach(() => {
		const profiles = [verifiedProfile, unverifiedProfile];
		repo = {
			create: jest.fn(),
			findByUsername: jest.fn(
				async (username: string) => profiles.find((p) => p.username === username) ?? null,
			),
			findById: jest.fn(async (id: string) => profiles.find((p) => p.id === id) ?? null),
			isBanned: jest.fn().mockResolvedValue(false),
		};
		verifyAccount = new VerifyAccount(new UserAuth(repo), CUTOFF, new LoggerMock());
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("resolves true for a known verified userId", async () => {
		await expect(verifyAccount.verify({ userId: "u-verified", playerInfo: null })).resolves.toBe(
			true,
		);
	});

	it("resolves false for a known unverified userId", async () => {
		await expect(verifyAccount.verify({ userId: "u-unverified", playerInfo: null })).resolves.toBe(
			false,
		);
	});

	it("resolves true for a correct PIN of a verified account", async () => {
		await expect(
			verifyAccount.verify({ userId: null, playerInfo: playerInfo("Verified", PIN) }),
		).resolves.toBe(true);
	});

	it("resolves false for a wrong PIN of a verified account", async () => {
		await expect(
			verifyAccount.verify({ userId: null, playerInfo: playerInfo("Verified", "9999") }),
		).resolves.toBe(false);
	});

	it("resolves false for a banned verified account", async () => {
		repo.isBanned.mockResolvedValue(true);

		await expect(verifyAccount.verify({ userId: "u-verified", playerInfo: null })).resolves.toBe(
			false,
		);
		await expect(
			verifyAccount.verify({ userId: null, playerInfo: playerInfo("Verified", PIN) }),
		).resolves.toBe(false);
	});

	it("resolves false without a userId or a PIN and reads no account", async () => {
		await expect(
			verifyAccount.verify({ userId: null, playerInfo: playerInfo("Verified", null) }),
		).resolves.toBe(false);
		await expect(verifyAccount.verify({ userId: null, playerInfo: null })).resolves.toBe(false);
		expect(repo.findById).not.toHaveBeenCalled();
		expect(repo.findByUsername).not.toHaveBeenCalled();
	});

	it("prefers the known userId over the PIN", async () => {
		await expect(
			verifyAccount.verify({ userId: "u-verified", playerInfo: playerInfo("Unverified", PIN) }),
		).resolves.toBe(true);
		expect(repo.findByUsername).not.toHaveBeenCalled();
	});

	it("resolves false when the repository throws", async () => {
		repo.findById.mockRejectedValue(new Error("db down"));

		await expect(verifyAccount.verify({ userId: "u-verified", playerInfo: null })).resolves.toBe(
			false,
		);
	});

	it("resolves false when the lookup outlasts the timeout", async () => {
		jest.useFakeTimers();
		repo.findById.mockReturnValue(new Promise(() => undefined));
		const slow = new VerifyAccount(new UserAuth(repo), CUTOFF, new LoggerMock(), 5000);

		const result = slow.verify({ userId: "u-verified", playerInfo: null });
		await jest.advanceTimersByTimeAsync(5000);

		await expect(result).resolves.toBe(false);
	});

	it("uses the cutoff for accounts created before it", async () => {
		const old = new VerifyAccount(new UserAuth(repo), new Date("2026-12-01T00:00:00Z"));

		await expect(old.verify({ userId: "u-unverified", playerInfo: null })).resolves.toBe(true);
	});
});
