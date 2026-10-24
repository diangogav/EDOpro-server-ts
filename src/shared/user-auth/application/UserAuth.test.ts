import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { ServerErrorMessage } from "@shared/user-auth/domain/ServerErrorMessage";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";
import { mock } from "jest-mock-extended";

import { UserAuth } from "./UserAuth";

function makePlayerInfo(overrides?: {
	name?: string;
	password?: string | null;
}): PlayerInfoMessage {
	return { name: "Jaden", password: "1234", ...overrides } as PlayerInfoMessage;
}

function makeProfile(isValidPassword: boolean): UserProfile {
	const profile = mock<UserProfile>({ id: "user-1" });
	profile.isValidPassword.mockResolvedValue(isValidPassword);

	return profile;
}

describe("UserAuth", () => {
	let repository: ReturnType<typeof mock<UserProfileRepository>>;
	let userAuth: UserAuth;

	beforeEach(() => {
		repository = mock<UserProfileRepository>();
		repository.isBanned.mockResolvedValue(false);
		userAuth = new UserAuth(repository);
	});

	it("returns the profile when the password is valid", async () => {
		const profile = makeProfile(true);
		repository.findByUsername.mockResolvedValue(profile);

		await expect(userAuth.run(makePlayerInfo())).resolves.toBe(profile);
	});

	it("returns USER_NOT_FOUND when the username is unknown", async () => {
		repository.findByUsername.mockResolvedValue(null);

		await expect(userAuth.run(makePlayerInfo())).resolves.toBe(ServerErrorMessage.USER_NOT_FOUND);
	});

	it("returns USER_BANNED when the user is banned", async () => {
		repository.findByUsername.mockResolvedValue(makeProfile(true));
		repository.isBanned.mockResolvedValue(true);

		await expect(userAuth.run(makePlayerInfo())).resolves.toBe(ServerErrorMessage.USER_BANNED);
	});

	it("returns INVALID_PASSWORD when the password does not match", async () => {
		repository.findByUsername.mockResolvedValue(makeProfile(false));

		await expect(userAuth.run(makePlayerInfo())).resolves.toBe(ServerErrorMessage.INVALID_PASSWORD);
	});

	it("returns INVALID_PASSWORD when no password is sent", async () => {
		repository.findByUsername.mockResolvedValue(makeProfile(true));

		await expect(userAuth.run(makePlayerInfo({ password: null }))).resolves.toBe(
			ServerErrorMessage.INVALID_PASSWORD,
		);
	});
});
