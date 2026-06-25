import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchController } from './search.controller';
import { SearchService }    from './search.service';
import { Song, SongSchema }         from '../song/schemas/song.schema';
import { Artist, ArtistSchema }     from '../artist/schemas/artist.schema';
import { Album, AlbumSchema }       from '../album/schemas/album.schema';
import { Playlist, PlaylistSchema } from '../playlist/schemas/playlist.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Song.name,     schema: SongSchema     },
      { name: Artist.name,   schema: ArtistSchema   },
      { name: Album.name,    schema: AlbumSchema    },
      { name: Playlist.name, schema: PlaylistSchema },
    ]),
    AuthModule,
  ],
  controllers: [SearchController],
  providers:   [SearchService],
})

export class SearchModule {}