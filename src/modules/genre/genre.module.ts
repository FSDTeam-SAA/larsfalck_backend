import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GenreController } from './genre.controller';
import { GenreService }    from './genre.service';
import { Genre, GenreSchema } from './schemas/genre.schema';
import { Song, SongSchema }   from '../song/schemas/song.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Genre.name, schema: GenreSchema },
      { name: Song.name,  schema: SongSchema  },
    ]),
    AuthModule,
  ],
  controllers: [GenreController],
  providers:   [GenreService],
  exports:     [MongooseModule],
})

export class GenreModule {}