import { faker } from "@faker-js/faker";
import { UserProfile, UserProfileProperties } from "../../../../../src/shared/user-profile/domain/UserProfile";

export class UserProfileMother {
	static create(params?: Partial<UserProfileProperties>): UserProfile {
		return UserProfile.from({
			id: faker.string.uuid(),
			username: faker.internet.username(),
			password: faker.internet.password(),
			email: faker.internet.email(),
			avatar: null,
			...params,
		});
	}
}
