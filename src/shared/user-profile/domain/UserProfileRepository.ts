import { UserProfile } from "./UserProfile";

export interface UserProfileRepository {
	create(userProfile: UserProfile): Promise<void>;
}
