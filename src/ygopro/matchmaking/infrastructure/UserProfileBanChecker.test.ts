import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";

import { UserProfileBanChecker } from "./UserProfileBanChecker";

const makeProfiles = (isBanned: boolean): UserProfileRepository => ({
	create: jest.fn(),
	findByUsername: jest.fn(),
	findById: jest.fn(),
	isBanned: jest.fn().mockResolvedValue(isBanned),
});

describe("UserProfileBanChecker", () => {
	it("reports a banned user as banned", async () => {
		const profiles = makeProfiles(true);
		const checker = new UserProfileBanChecker(profiles);

		await expect(checker.isBanned("user-1")).resolves.toBe(true);
		expect(profiles.isBanned).toHaveBeenCalledWith("user-1");
	});

	it("reports a user with no active ban as not banned", async () => {
		const profiles = makeProfiles(false);
		const checker = new UserProfileBanChecker(profiles);

		await expect(checker.isBanned("user-2")).resolves.toBe(false);
	});
});
