import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule }    from '@nestjs/jwt';
import { HomeController } from './home.controller';
import { HomeService }    from './home.service';
import { HomepageCache, HomepageCacheSchema } from './schemas/homepage-cache.schema';
import { SongStat, SongStatSchema }           from './schemas/song-stat.schema';
import { Song, SongSchema } from '../song/schemas/song.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { AuthModule }   from '../auth/auth.module';
import { QueueModule }  from '../../infrastructure/queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HomepageCache.name, schema: HomepageCacheSchema },
      { name: SongStat.name,      schema: SongStatSchema      },
      { name: Song.name,          schema: SongSchema          },
      { name: User.name,          schema: UserSchema          },
    ]),
    AuthModule,
    QueueModule,
    JwtModule,   
  ],
  controllers: [HomeController],
  providers:   [HomeService],
})

export class HomeModule {}