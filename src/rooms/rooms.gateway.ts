import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

type JwtUserPayload = {
  sub: number;
  username: string;
  email: string;
};

type RoomCreatedPayload = {
  roomId: string;
  code: string;
  players: Array<{
    userId: number;
    username: string;
    isHost: boolean;
  }>;
};

type RoomUpdatedPayload = {
  players: Array<{
    userId: number;
    username: string;
    isHost: boolean;
  }>;
};

@WebSocketGateway({ cors: { origin: '*' } })
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly userSockets = new Map<number, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(@ConnectedSocket() client: Socket) {
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtUserPayload>(token, {
        secret:
          this.configService.get<string>('JWT_SECRET') ??
          'development-jwt-secret',
      });

      client.data.userId = payload.sub;

      const sockets = this.userSockets.get(payload.sub) ?? new Set<string>();
      sockets.add(client.id);
      this.userSockets.set(payload.sub, sockets);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as number | undefined;

    if (!userId) {
      return;
    }

    const sockets = this.userSockets.get(userId);

    if (!sockets) {
      return;
    }

    sockets.delete(client.id);

    if (sockets.size === 0) {
      this.userSockets.delete(userId);
    }
  }

  async joinUserSocketsToRoom(userId: number, roomCode: string) {
    const sockets = this.userSockets.get(userId);

    if (!sockets) {
      return;
    }

    await Promise.all(
      [...sockets].map((socketId) =>
        this.server.sockets.sockets.get(socketId)?.join(`room:${roomCode}`),
      ),
    );
  }

  emitRoomCreated(roomCode: string, payload: RoomCreatedPayload) {
    this.server.to(`room:${roomCode}`).emit('room_created', payload);
  }

  emitRoomUpdated(roomCode: string, payload: RoomUpdatedPayload) {
    this.server.to(`room:${roomCode}`).emit('room_updated', payload);
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth.token;

    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken.replace(/^Bearer\s+/i, '');
    }

    const authorization = client.handshake.headers.authorization;

    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      return authorization.slice(7);
    }

    return null;
  }
}
