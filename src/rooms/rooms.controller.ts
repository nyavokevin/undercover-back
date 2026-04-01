import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRoomDto } from './dto/create-room.dto';
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
}
