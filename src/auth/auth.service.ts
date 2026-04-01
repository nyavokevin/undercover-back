import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SafeUser, UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(username: string, email: string, password: string) {
    const user = await this.usersService.create(username, email, password);
    return this.issueToken(user);
  }

  async validateUser(email: string, password: string): Promise<SafeUser | null> {
    return this.usersService.validateCredentials(email, password);
  }

  async login(user: SafeUser) {
    return this.issueToken(user);
  }

  private issueToken(user: SafeUser) {
    const payload = { sub: user.id, username: user.username, email: user.email };

    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }
}
