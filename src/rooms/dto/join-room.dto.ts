import { IsNotEmpty, IsString, Length } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  @Length(5, 5)
  code!: string;
}
