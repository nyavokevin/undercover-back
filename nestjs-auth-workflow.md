# NestJS Authentication — Integrated Into This Project

## Goal

Integrate a JWT-based authentication module into this NestJS starter so the app gains:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

This keeps the original Nest app structure and adds a minimal in-memory auth flow that can later be replaced with a database-backed implementation.

---

## Packages To Install

```bash
npm install @nestjs/passport @nestjs/jwt @nestjs/config passport passport-jwt passport-local bcrypt class-validator class-transformer
npm install -D @types/passport-jwt @types/passport-local @types/bcrypt
```

---

## Target Project Structure

```text
src/
├── app.controller.ts
├── app.module.ts
├── app.service.ts
├── main.ts
├── auth/
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── dto/
│   │   ├── login.dto.ts
│   │   └── register.dto.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── local-auth.guard.ts
│   └── strategies/
│       ├── jwt.strategy.ts
│       └── local.strategy.ts
└── users/
    ├── user.entity.ts
    ├── users.module.ts
    └── users.service.ts
```

---

## 1. Add Environment Configuration

Use `@nestjs/config` so JWT secrets are available across the app.

```env
JWT_SECRET=your_strong_access_secret_here
JWT_EXPIRES_IN=15m
```

Update bootstrap usage through the root module rather than reading secrets directly inside every class.

---

## 2. Create the User Model

```ts
// src/users/user.entity.ts
export class User {
  id: number;
  email: string;
  passwordHash: string;
}
```

This is intentionally simple and in-memory friendly.

---

## 3. Create the Users Service

```ts
// src/users/users.service.ts
import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  private users: User[] = [];

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email === email);
  }

  async create(email: string, password: string): Promise<Omit<User, 'passwordHash'>> {
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user: User = {
      id: Date.now(),
      email,
      passwordHash,
    };

    this.users.push(user);

    return {
      id: user.id,
      email: user.email,
    };
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.findByEmail(email);

    if (!user) {
      return null;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);

    if (!matches) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
    };
  }
}
```

Create the module that exports the service:

```ts
// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

---

## 4. Add DTOs For Validation

```ts
// src/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

```ts
// src/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

Also enable validation globally:

```ts
// src/main.ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

---

## 5. Create the Auth Service

```ts
// src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string) {
    const user = await this.usersService.create(email, password);
    return this.issueToken(user);
  }

  async validateUser(email: string, password: string) {
    return this.usersService.validateCredentials(email, password);
  }

  async login(user: { id: number; email: string }) {
    return this.issueToken(user);
  }

  private issueToken(user: { id: number; email: string }) {
    const payload = { sub: user.id, email: user.email };

    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }
}
```

---

## 6. Add Passport Strategies

### Local Strategy

```ts
// src/auth/strategies/local.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user = await this.authService.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }
}
```

### JWT Strategy

```ts
// src/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: number; email: string }) {
    return {
      id: payload.sub,
      email: payload.email,
    };
  }
}
```

---

## 7. Add Guards

```ts
// src/auth/guards/local-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
```

```ts
// src/auth/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

---

## 8. Create the Auth Controller

```ts
// src/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Body() _body: LoginDto, @Request() req: { user: { id: number; email: string } }) {
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: { user: { id: number; email: string } }) {
    return req.user;
  }
}
```

---

## 9. Create the Auth Module

```ts
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '15m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, LocalAuthGuard, JwtAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}
```

---

## 10. Integrate It Into the Existing Root Module

Your current root module is minimal:

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Update it to load configuration and the auth stack:

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

This is the integration point that wires the auth module into the current app.

---

## 11. Request Flow In This Integrated Version

```text
POST /auth/register
  → AuthController.register()
    → AuthService.register()
      → UsersService.create()
        → bcrypt.hash()
      → JwtService.sign()
        → { access_token, user }

POST /auth/login
  → LocalAuthGuard
    → LocalStrategy.validate(email, password)
      → AuthService.validateUser()
        → UsersService.validateCredentials()
          → bcrypt.compare()
  → AuthController.login(req.user)
    → AuthService.login()
      → JwtService.sign()
        → { access_token, user }

GET /auth/me
  Authorization: Bearer <token>
  → JwtAuthGuard
    → JwtStrategy.validate(payload)
      → req.user = { id, email }
  → AuthController.getProfile()
```

---

## 12. Minimal Implementation Checklist

- [ ] Install auth, JWT, config, bcrypt, and validation dependencies
- [ ] Add `JWT_SECRET` and `JWT_EXPIRES_IN` to environment configuration
- [ ] Create `users` module with in-memory storage
- [ ] Create DTOs for login and registration validation
- [ ] Create `AuthService`, local strategy, and JWT strategy
- [ ] Create auth guards and controller
- [ ] Import `ConfigModule`, `UsersModule`, and `AuthModule` in `src/app.module.ts`
- [ ] Enable global `ValidationPipe` in `src/main.ts`

---

## 13. Recommended Next Step After This Integration

Once the module works end-to-end, replace the in-memory users array with a persistent data layer such as Prisma, TypeORM, or Mongoose, then add refresh-token rotation and rate limiting for production hardening.
