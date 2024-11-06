import { User } from "./User";

export interface UserRepository {
	findBy(username: string): Promise<User | null>;
}
