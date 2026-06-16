import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SONG_QUEUE } from './queue.constants';
import { QueueProducerService } from './queue-producer.service';
import { SongProcessor } from './song.processor';
import { Song, SongSchema } from '../../modules/song/schemas/song.schema';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports:    [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
        },
      }),
      inject: [ConfigService],
    }),

    BullModule.registerQueue({ name: SONG_QUEUE }),

    MongooseModule.forFeature([{ name: Song.name, schema: SongSchema }]),
    S3Module,
  ],
  providers: [QueueProducerService, SongProcessor],
  exports:   [QueueProducerService],
})

export class QueueModule {}