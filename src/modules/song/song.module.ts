import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SongController } from './song.controller';
import { SongService }    from './song.service';
import { Song, SongSchema } from './schemas/song.schema';
import { AuthModule }  from '../auth/auth.module';
import { S3Module }    from '../../infrastructure/s3/s3.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Song.name, schema: SongSchema }]),
    AuthModule,
    S3Module,
    QueueModule,
  ],
  controllers: [SongController],
  providers:   [SongService],
  exports:     [MongooseModule],
})

export class SongModule {}