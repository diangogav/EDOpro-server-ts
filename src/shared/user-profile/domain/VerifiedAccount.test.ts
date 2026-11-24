import { isVerifiedAccount } from "./VerifiedAccount";

const CUTOFF = new Date("2026-12-01T00:00:00.000Z");

const account = (
	overrides: Partial<{
		emailVerifiedAt: Date | null;
		discordId: string | null;
		createdAt: Date | null;
	}> = {},
) => ({
	emailVerifiedAt: null,
	discordId: null,
	createdAt: new Date("2026-12-05T00:00:00.000Z"),
	...overrides,
});

describe("isVerifiedAccount", () => {
	it("accepts an account that confirmed its email", () => {
		expect(
			isVerifiedAccount(account({ emailVerifiedAt: new Date("2026-12-06T00:00:00.000Z") }), CUTOFF),
		).toBe(true);
	});

	it("accepts an account with a linked Discord", () => {
		expect(isVerifiedAccount(account({ discordId: "123456789" }), CUTOFF)).toBe(true);
	});

	it("accepts an account created before the cutoff", () => {
		expect(
			isVerifiedAccount(account({ createdAt: new Date("2026-11-30T23:59:59.000Z") }), CUTOFF),
		).toBe(true);
	});

	it("rejects an account created at or after the cutoff without email or Discord", () => {
		expect(isVerifiedAccount(account({ createdAt: CUTOFF }), CUTOFF)).toBe(false);
		expect(isVerifiedAccount(account(), CUTOFF)).toBe(false);
	});

	it("exempts no account by age when there is no cutoff", () => {
		expect(
			isVerifiedAccount(account({ createdAt: new Date("2020-01-01T00:00:00.000Z") }), null),
		).toBe(false);
	});

	it("rejects an account whose creation date is unknown", () => {
		expect(isVerifiedAccount(account({ createdAt: null }), CUTOFF)).toBe(false);
	});
});
