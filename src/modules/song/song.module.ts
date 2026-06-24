import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { SongController } from './song.controller';
import { SongService }    from './song.service';
import { Song, SongSchema } from './schemas/song.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { AuthModule }  from '../auth/auth.module';
import { S3Module }    from '../../infrastructure/s3/s3.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Song.name, schema: SongSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    S3Module,
    QueueModule,
    JwtModule,  
  ],
  controllers: [SongController],
  providers:   [SongService],
  exports:     [MongooseModule],
})

export class SongModule {}