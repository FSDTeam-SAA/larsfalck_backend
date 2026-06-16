import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TagService } from './modules/tag/tag.service';
import { TagController } from './modules/tag/tag.controller';
import { TagModule } from './modules/tag/tag.module';
import { SongModule } from './modules/song/song.module';
import configs from './config';
import { LoggerModule }    from './common/logger/logger.module';
import { AuthModule }      from './modules/auth/auth.module';
import { UserModule }      from './modules/user/user.module';
import { GenreModule }     from './modules/genre/genre.module';
import { ArtistModule }    from './modules/artist/artist.module';
import { AlbumModule }     from './modules/album/album.module';
import { AppController }   from './app.controller';
import { AppService }      from './app.service';
import { DatabaseModule }  from './infrastructure/database/database.module';
import { QueueModule } from './infrastructure/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:    true,
      load:        configs,
      envFilePath: '.env',
    }),

    ThrottlerModule.forRootAsync({
      useFactory: (configService: ConfigService) => [
        {
          ttl:   configService.get<number>('app.rateLimitWindow', 15) * 60 * 1000,
          limit: configService.get<number>('app.rateLimitMax', 100),
        },
      ],
      inject: [ConfigService],
    }),

    LoggerModule,
    DatabaseModule,
    AuthModule,
    UserModule,
    GenreModule,
    ArtistModule,
    AlbumModule,
    TagModule,
    SongModule,
    QueueModule,
  ],
  controllers: [AppController, TagController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    TagService,
  ],
})

export class AppModule {}