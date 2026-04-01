import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { UpdateRoomStatusDto } from './dto/update-room-status.dto';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';

type AuthenticatedRequest = {
  user: {
    id: number;
    username: string;
    email: string;
  };
};

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly roomsGateway: RoomsGateway,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createRoom(
    @Body() body: CreateRoomDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const room = await this.roomsService.createRoom(req.user, body.maxPlayers);

    await this.roomsGateway.joinUserSocketsToRoom(req.user.id, room.code);
    this.roomsGateway.emitRoomCreated(room.code, {
      roomId: room.roomId,
      code: room.code,
      players: room.players,
    });

    return {
      roomId: room.roomId,
      code: room.code,
      status: room.status,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('join')
  async joinRoom(
    @Body() body: JoinRoomDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const room = await this.roomsService.joinRoom(req.user, body.code);

    await this.roomsGateway.joinUserSocketsToRoom(req.user.id, room.code);
    this.roomsGateway.emitRoomUpdated(room.code, {
      players: room.players,
    });

    return {
      roomId: room.roomId,
      code: room.code,
      players: room.players,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':code')
  async getRoomInfo(@Param('code') code: string) {
    return this.roomsService.getRoomInfo(code);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':code/status')
  async updateRoomStatus(
    @Param('code') code: string,
    @Body() body: UpdateRoomStatusDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const room = await this.roomsService.updateRoomStatus(
      req.user,
      code,
      body.status,
    );

    this.roomsGateway.emitRoomUpdated(room.code, {
      roomId: room.roomId,
      code: room.code,
      status: room.status,
      players: room.players.map((player) => ({
        userId: player.userId,
        username: player.username,
        isHost: player.isHost,
      })),
    });

    return room;
  }
}
