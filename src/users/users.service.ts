import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  private readonly users: User[] = [];

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email === email);
  }

  async create(
    username: string,
    email: string,
    password: string,
  ): Promise<SafeUser> {
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user: User = {
      id: Date.now(),
      username,
      email,
      passwordHash,
    };

    this.users.push(user);

    return this.toSafeUser(user);
  }

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<SafeUser | null> {
    const user = await this.findByEmail(email);

    if (!user) {
      return null;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return null;
    }

    return this.toSafeUser(user);
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
    };
  }
}
