import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateRoomDto {
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(12)
  maxPlayers?: number;
}
