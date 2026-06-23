import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SONG_QUEUE, SUBSCRIPTION_QUEUE, HOME_QUEUE } from './queue.constants';
import { QueueProducerService }        from './queue-producer.service';
import { SubscriptionProducerService } from './subscription-producer.service';
import { HomeProducerService }         from './home-producer.service';
import { SongProcessor }               from './song.processor';
import { SubscriptionProcessor }       from './subscription.processor';
import { HomeProcessor }               from './home.processor';
import { Song, SongSchema }            from '../../modules/song/schemas/song.schema';
import { User, UserSchema }            from '../../modules/auth/schemas/user.schema';
import { SongStat, SongStatSchema }    from '../../modules/home/schemas/song-stat.schema';
import { HomepageCache, HomepageCacheSchema } from '../../modules/home/schemas/homepage-cache.schema';
import { S3Module }    from '../s3/s3.module';
import { EmailModule } from '../email/email.module';
import { RedisModule } from '../redis/redis.module';

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
      { name: HOME_QUEUE         },
    ),

    MongooseModule.forFeature([
      { name: Song.name,          schema: SongSchema          },
      { name: User.name,          schema: UserSchema          },
      { name: SongStat.name,      schema: SongStatSchema      },
      { name: HomepageCache.name, schema: HomepageCacheSchema },
    ]),
    S3Module,
    EmailModule,
    RedisModule,
  ],
  providers: [
    QueueProducerService,
    SubscriptionProducerService,
    HomeProducerService,
    SongProcessor,
    SubscriptionProcessor,
    HomeProcessor,
  ],
  exports: [QueueProducerService, SubscriptionProducerService, HomeProducerService],
})

export class QueueModule {}