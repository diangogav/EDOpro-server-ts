import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";

import { BanChecker } from "../domain/BanChecker";

/** `BanChecker` over the shared user-profile store's existing ban lookup. */
export class UserProfileBanChecker implements BanChecker {
	public constructor(private readonly profiles: UserProfileRepository) {}

	public async isBanned(userId: string): Promise<boolean> {
		return this.profiles.isBanned(userId);
	}
}
