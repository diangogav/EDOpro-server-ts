import bcrypt from "bcrypt";

export type UserProfileProperties = {
  id: string;
  username: string;
  password: string;
  email: string;
  avatar: string | null;
};
export class UserProfile {
  readonly id: string;
  readonly username: string;
  readonly password: string;
  readonly email: string;
  readonly avatar: string | null;

  private constructor({
    id,
    username,
    password,
    email,
    avatar,
  }: UserProfileProperties) {
    this.id = id;
    this.username = username;
    this.password = password;
    this.email = email;
    this.avatar = avatar;
  }

  static async create({
    id,
    username,
    password,
    email,
    avatar,
  }: {
    id: string;
    username: string;
    password: string;
    email: string;
    avatar: string | null;
  }): Promise<UserProfile> {
    const passwordHashed = await bcrypt.hash(password, 10);

    return new UserProfile({
      id,
      username,
      password: passwordHashed,
      email,
      avatar,
    });
  }

  static from(data: {
    id: string;
    username: string;
    password: string;
    email: string;
    avatar: string | null;
  }): UserProfile {
    return new UserProfile(data);
  }

  async isValidPassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }
}
