import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { ISocket } from "@shared/socket/domain/ISocket";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";
import { ServerErrorClientMessage } from "@edopro/messages/server-to-client/ServerErrorMessageClientMessage";

import { CredentialResolver } from "./CredentialResolver";

const profile = (id: string): UserProfile =>
	UserProfile.from({ id, username: "Player", password: "hash", email: "e@e", avatar: null });

const socketWith = (resolvedUserId: string | null): ISocket =>
	({ resolvedUserId }) as unknown as ISocket;

const playerInfo = (name: string, password: string | null): PlayerInfoMessage =>
	({ name, password }) as unknown as PlayerInfoMessage;

describe("CredentialResolver", () => {
	let repo: jest.Mocked<UserProfileRepository>;
	let userAuth: jest.Mocked<UserAuth>;
	let resolver: CredentialResolver;

	beforeEach(() => {
		repo = {
			create: jest.fn(),
			findByUsername: jest.fn(),
			findById: jest.fn(),
			isBanned: jest.fn(),
		};
		userAuth = { run: jest.fn() } as unknown as jest.Mocked<UserAuth>;
		resolver = new CredentialResolver(repo, userAuth);
	});

	describe("ticket (handshake) → verified", () => {
		it("resolves a verified credential when the profile exists and is not banned", async () => {
			repo.findById.mockResolvedValue(profile("u-1"));
			repo.isBanned.mockResolvedValue(false);

			const credential = await resolver.resolve(socketWith("u-1"), playerInfo("Player", null));

			expect(credential).toEqual({ kind: "verified", userId: "u-1" });
		});

		it("falls back to guest when the ticket's profile no longer exists", async () => {
			repo.findById.mockResolvedValue(null);

			const credential = await resolver.resolve(socketWith("u-1"), playerInfo("Player", null));

			expect(credential).toEqual({ kind: "guest", name: "Player" });
		});

		it("falls back to guest when the ticket's profile is banned", async () => {
			repo.findById.mockResolvedValue(profile("u-1"));
			repo.isBanned.mockResolvedValue(true);

			const credential = await resolver.resolve(socketWith("u-1"), playerInfo("Player", null));

			expect(credential).toEqual({ kind: "guest", name: "Player" });
		});
	});

	describe("PIN (nickname) → external", () => {
		it("resolves an external credential when UserAuth accepts the PIN", async () => {
			userAuth.run.mockResolvedValue(profile("u-2"));

			const credential = await resolver.resolve(socketWith(null), playerInfo("Player", "1234"));

			expect(credential).toEqual({ kind: "external", userId: "u-2" });
		});

		it("falls back to guest when the PIN is invalid", async () => {
			userAuth.run.mockResolvedValue({} as ServerErrorClientMessage);

			const credential = await resolver.resolve(socketWith(null), playerInfo("Player", "9999"));

			expect(credential).toEqual({ kind: "guest", name: "Player" });
		});
	});

	describe("no credential → guest", () => {
		it("resolves a guest when there is neither ticket nor PIN", async () => {
			const credential = await resolver.resolve(socketWith(null), playerInfo("Player", null));

			expect(credential).toEqual({ kind: "guest", name: "Player" });
			expect(userAuth.run).not.toHaveBeenCalled();
		});
	});
});
