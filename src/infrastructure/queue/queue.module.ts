import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SONG_QUEUE, SUBSCRIPTION_QUEUE } from './queue.constants';
import { QueueProducerService } from './queue-producer.service';
import { SubscriptionProducerService } from './subscription-producer.service';
import { SongProcessor } from './song.processor';
import { SubscriptionProcessor } from './subscription.processor';
import { Song, SongSchema } from '../../modules/song/schemas/song.schema';
import { User, UserSchema } from '../../modules/auth/schemas/user.schema';
import { S3Module }    from '../s3/s3.module';
import { EmailModule } from '../email/email.module';

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

    BullModule.registerQueue(
      { name: SONG_QUEUE         },
      { name: SUBSCRIPTION_QUEUE },
    ),

    MongooseModule.forFeature([
      { name: Song.name, schema: SongSchema },
      { name: User.name, schema: UserSchema },
    ]),
    S3Module,
    EmailModule,
  ],
  providers: [
    QueueProducerService,
    SubscriptionProducerService,
    SongProcessor,
    SubscriptionProcessor,
  ],
  exports: [QueueProducerService, SubscriptionProducerService],
})

export class QueueModule {}