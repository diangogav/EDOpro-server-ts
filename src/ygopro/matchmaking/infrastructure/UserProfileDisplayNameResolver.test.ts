import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";

import { UserProfileDisplayNameResolver } from "./UserProfileDisplayNameResolver";

const makeProfiles = (profile: UserProfile | null): UserProfileRepository => ({
	create: jest.fn(),
	findByUsername: jest.fn(),
	findById: jest.fn().mockResolvedValue(profile),
	isBanned: jest.fn(),
});

describe("UserProfileDisplayNameResolver", () => {
	it("resolves the username of a known user", async () => {
		const profile = UserProfile.from({
			id: "user-1",
			username: "Yugi",
			password: "hashed",
			email: "yugi@example.com",
			avatar: null,
		});
		const resolver = new UserProfileDisplayNameResolver(makeProfiles(profile));

		await expect(resolver.resolve("user-1")).resolves.toBe("Yugi");
	});

	it("resolves null for an unknown user", async () => {
		const resolver = new UserProfileDisplayNameResolver(makeProfiles(null));

		await expect(resolver.resolve("ghost")).resolves.toBeNull();
	});

	const profileWithUsername = (username: string) =>
		UserProfile.from({
			id: "user-1",
			username,
			password: "hashed",
			email: "user@example.com",
			avatar: null,
		});

	it("resolves null for an empty username instead of leaking an empty string", async () => {
		const resolver = new UserProfileDisplayNameResolver(makeProfiles(profileWithUsername("")));

		await expect(resolver.resolve("user-1")).resolves.toBeNull();
	});

	it("resolves null for a whitespace-only username", async () => {
		const resolver = new UserProfileDisplayNameResolver(makeProfiles(profileWithUsername("   ")));

		await expect(resolver.resolve("user-1")).resolves.toBeNull();
	});

	it("trims surrounding whitespace from the username", async () => {
		const resolver = new UserProfileDisplayNameResolver(
			makeProfiles(profileWithUsername("  Yugi  ")),
		);

		await expect(resolver.resolve("user-1")).resolves.toBe("Yugi");
	});
});
