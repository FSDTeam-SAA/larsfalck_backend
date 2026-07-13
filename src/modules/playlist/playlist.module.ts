import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlaylistController } from './playlist.controller';
import { PlaylistService }    from './playlist.service';
import { Playlist, PlaylistSchema } from './schemas/playlist.schema';
import { Song, SongSchema } from '../song/schemas/song.schema';
import { AuthModule }  from '../auth/auth.module';
import { S3Module }    from '../../infrastructure/s3/s3.module';
import { User, UserSchema } from '../auth/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Playlist.name, schema: PlaylistSchema },
      { name: Song.name,     schema: SongSchema     },
      { name: User.name,     schema: UserSchema     },
    ]),
    AuthModule,
    S3Module,
  ],
  controllers: [PlaylistController],
  providers:   [PlaylistService],
  exports:     [MongooseModule],
})

export class PlaylistModule {}