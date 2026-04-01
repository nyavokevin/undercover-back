import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
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

  private readonly activeRoomStatuses = [
    RoomStatus.WAITING,
    RoomStatus.IN_PROGRESS,
  ];

  private mapRoomDetails(room: {
    id: string;
    code: string;
    hostId?: number;
    status: RoomStatus;
    maxPlayers: number;
    createdAt: Date;
    updatedAt: Date;
    host: {
      id: number;
      username: string;
    };
    players: Array<{
      isHost: boolean;
      createdAt: Date;
      user: {
        id: number;
        username: string;
      };
    }>;
  }) {
    return {
      roomId: room.id,
      code: room.code,
      status: room.status,
      config: {
        maxPlayers: room.maxPlayers,
      },
      host: {
        userId: room.host.id,
        username: room.host.username,
      },
      players: room.players.map((player) => ({
        userId: player.user.id,
        username: player.user.username,
        isHost: player.isHost,
        joinedAt: player.createdAt,
      })),
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  private async findRoomWithDetails(roomCode: string) {
    return this.prisma.room.findUnique({
      where: {
        code: roomCode.trim().toUpperCase(),
      },
      include: {
        host: {
          select: {
            id: true,
            username: true,
          },
        },
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async getRoomInfo(roomCode: string) {
    const room = await this.findRoomWithDetails(roomCode);

    if (!room) {
      throw new NotFoundException('ROOM_NOT_FOUND');
    }

    return this.mapRoomDetails(room);
  }

  async updateRoomStatus(
    user: AuthenticatedUser,
    roomCode: string,
    status: RoomStatus,
  ) {
    const room = await this.findRoomWithDetails(roomCode);

    if (!room) {
      throw new NotFoundException('ROOM_NOT_FOUND');
    }

    if (room.hostId !== user.id) {
      throw new ConflictException('ONLY_HOST_CAN_UPDATE_ROOM_STATUS');
    }

    if (room.status === status) {
      return this.mapRoomDetails(room);
    }

    if (room.status === RoomStatus.FINISHED) {
      throw new BadRequestException('ROOM_ALREADY_FINISHED');
    }

    if (room.status === RoomStatus.WAITING && status === RoomStatus.FINISHED) {
      throw new BadRequestException('INVALID_ROOM_STATUS_TRANSITION');
    }

    if (
      room.status === RoomStatus.IN_PROGRESS &&
      status === RoomStatus.WAITING
    ) {
      throw new BadRequestException('INVALID_ROOM_STATUS_TRANSITION');
    }

    const updatedRoom = await this.prisma.room.update({
      where: {
        id: room.id,
      },
      data: {
        status,
      },
      include: {
        host: {
          select: {
            id: true,
            username: true,
          },
        },
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    return this.mapRoomDetails(updatedRoom);
  }

  async createRoom(user: AuthenticatedUser, maxPlayers = 8) {
    const activeMembership = await this.prisma.player.findFirst({
      where: {
        userId: user.id,
        room: {
          status: {
            in: this.activeRoomStatuses,
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
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new InternalServerErrorException(
      'Unable to generate a unique room code',
    );
  }

  async joinRoom(user: AuthenticatedUser, roomCode: string) {
    const normalizedCode = roomCode.trim().toUpperCase();

    const room = await this.prisma.room.findUnique({
      where: {
        code: normalizedCode,
      },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('ROOM_NOT_FOUND');
    }

    const existingPlayer = room.players.find(
      (player) => player.user.id === user.id,
    );

    if (existingPlayer) {
      return {
        roomId: room.id,
        code: room.code,
        status: room.status,
        players: room.players.map((player) => ({
          userId: player.user.id,
          username: player.user.username,
          isHost: player.isHost,
        })),
      };
    }

    const activeMembership = await this.prisma.player.findFirst({
      where: {
        userId: user.id,
        room: {
          status: {
            in: this.activeRoomStatuses,
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

    if (
      room.status === RoomStatus.IN_PROGRESS ||
      room.status === RoomStatus.FINISHED
    ) {
      throw new BadRequestException('GAME_ALREADY_STARTED');
    }

    if (room.players.length >= room.maxPlayers) {
      throw new ConflictException('ROOM_FULL');
    }

    await this.prisma.player.create({
      data: {
        userId: user.id,
        roomId: room.id,
        isHost: false,
      },
    });

    return {
      roomId: room.id,
      code: room.code,
      status: room.status,
      players: [
        ...room.players.map((existingPlayer) => ({
          userId: existingPlayer.user.id,
          username: existingPlayer.user.username,
          isHost: existingPlayer.isHost,
        })),
        {
          userId: user.id,
          username: user.username,
          isHost: false,
        },
      ],
    };
  }

  private generateRoomCode(length = 5) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    return Array.from({ length }, () => {
      const index = Math.floor(Math.random() * alphabet.length);
      return alphabet[index];
    }).join('');
  }
}
