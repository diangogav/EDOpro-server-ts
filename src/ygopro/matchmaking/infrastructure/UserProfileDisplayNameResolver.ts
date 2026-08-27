import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";

import { DisplayNameResolver } from "../domain/DisplayNameResolver";

/** Resolves a matchmaking display name from the shared user-profile store. */
export class UserProfileDisplayNameResolver implements DisplayNameResolver {
	constructor(private readonly profiles: UserProfileRepository) {}

	async resolve(userId: string): Promise<string | null> {
		const profile = await this.profiles.findById(userId);
		// A blank username is not a public name: the matched payload promises a
		// presentable name or null, never an empty/whitespace string.
		const username = profile?.username.trim();
		return username ? username : null;
	}
}
