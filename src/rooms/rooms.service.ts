import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuthenticatedUser = {
  id: number;
  username: string;
  email: string;
};

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRoom(user: AuthenticatedUser, maxPlayers = 8) {
    const activeMembership = await this.prisma.player.findFirst({
      where: {
        userId: user.id,
        room: {
          status: {
            in: [RoomStatus.WAITING, RoomStatus.IN_PROGRESS],
          },
        },
      },
      include: {
        room: true,
      },
    });

    if (activeMembership) {
      throw new ConflictException('User is already in an active room');
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = this.generateRoomCode();

      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const room = await tx.room.create({
            data: {
              code,
              hostId: user.id,
              status: RoomStatus.WAITING,
              maxPlayers,
            },
          });

          const player = await tx.player.create({
            data: {
              userId: user.id,
              roomId: room.id,
              isHost: true,
            },
          });

          return {
            room,
            player,
          };
        });

        return {
          roomId: result.room.id,
          code: result.room.code,
          status: result.room.status,
          players: [
            {
              userId: user.id,
              username: user.username,
              isHost: result.player.isHost,
            },
          ],
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }

        throw error;
      }
    }

    throw new InternalServerErrorException('Unable to generate a unique room code');
  }

  private generateRoomCode(length = 5) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    return Array.from({ length }, () => {
      const index = Math.floor(Math.random() * alphabet.length);
      return alphabet[index];
    }).join('');
  }
}
