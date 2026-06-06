import { mock, MockProxy } from "jest-mock-extended";

import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";
import { UserProfileMother } from "@test-support/mothers/user-profile/UserProfileMother";

import { RankedUserResolver } from "./RankedUserResolver";

const makeSocket = (resolvedUserId?: string) =>
  ({ resolvedUserId } as { resolvedUserId?: string });

const makePlayerInfo = () =>
  ({
    name: "TestPlayer",
    password: "gamepassword",
    previousMessage: Buffer.alloc(0),
  } as any);

describe("RankedUserResolver", () => {
  let userAuth: MockProxy<UserAuth>;
  let userProfileRepo: MockProxy<UserProfileRepository>;
  let resolver: RankedUserResolver;

  beforeEach(() => {
    userAuth = mock<UserAuth>();
    userProfileRepo = mock<UserProfileRepository>();
    resolver = new RankedUserResolver(userAuth, userProfileRepo);
  });

  describe("resolve() — ticket path (resolvedUserId present)", () => {
    it("returns the userId when user exists and is not banned", async () => {
      const profile = UserProfileMother.create({ id: "user-abc" });
      const socket = makeSocket("user-abc");

      userProfileRepo.findById.mockResolvedValue(profile);
      userProfileRepo.isBanned.mockResolvedValue(false);

      const result = await resolver.resolve(makePlayerInfo(), socket as any);

      expect(result).toBe("user-abc");
      expect(userAuth.run).not.toHaveBeenCalled();
    });

    it("returns null when findById returns null (user not found)", async () => {
      const socket = makeSocket("non-existent-id");

      userProfileRepo.findById.mockResolvedValue(null);

      const result = await resolver.resolve(makePlayerInfo(), socket as any);

      expect(result).toBeNull();
      expect(userAuth.run).not.toHaveBeenCalled();
    });

    it("returns null when the user is banned (defense-in-depth re-ban-check)", async () => {
      const profile = UserProfileMother.create({ id: "banned-user" });
      const socket = makeSocket("banned-user");

      userProfileRepo.findById.mockResolvedValue(profile);
      userProfileRepo.isBanned.mockResolvedValue(true);

      const result = await resolver.resolve(makePlayerInfo(), socket as any);

      expect(result).toBeNull();
      expect(userAuth.run).not.toHaveBeenCalled();
    });
  });

  describe("resolve() — game password path (no resolvedUserId)", () => {
    it("returns the userId when userAuth.run succeeds", async () => {
      const profile = UserProfileMother.create({ id: "game-user" });
      const socket = makeSocket(undefined);

      userAuth.run.mockResolvedValue(profile);

      const result = await resolver.resolve(makePlayerInfo(), socket as any);

      expect(result).toBe("game-user");
      expect(userProfileRepo.findById).not.toHaveBeenCalled();
    });

    it("returns null when userAuth.run returns an error (not a UserProfile)", async () => {
      const socket = makeSocket(undefined);

      userAuth.run.mockResolvedValue({} as any);

      const result = await resolver.resolve(makePlayerInfo(), socket as any);

      expect(result).toBeNull();
      expect(userProfileRepo.findById).not.toHaveBeenCalled();
    });
  });
});
