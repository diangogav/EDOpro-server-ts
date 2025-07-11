import { UserProfile } from "./UserProfile";

export interface UserProfileRepository {
	create(userProfile: UserProfile): Promise<void>;
	findByUsername(username: string): Promise<UserProfile | null>;
	isBanned(userId: string): Promise<boolean>;
}
