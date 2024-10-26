import { randomUUID } from "crypto";

import { UserProfile } from "../domain/UserProfile";
import { UserProfileRepository } from "../domain/UserProfileRepository";

export class UserProfileCreator {
	constructor(private readonly userProfileRepository: UserProfileRepository) {}

	async run({
		username,
		password,
		email,
		avatar,
	}: {
		username: string;
		password: string;
		email: string;
		avatar: string | null;
	}): Promise<{ id: string }> {
		const id = randomUUID();
		const userProfile = UserProfile.create({ id, username, password, email, avatar });
		await this.userProfileRepository.create(userProfile);

		return {
			id,
		};
	}
}
