import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArtistController } from './artist.controller';
import { ArtistService }    from './artist.service';
import { Artist, ArtistSchema } from './schemas/artist.schema';
import { AuthModule } from '../auth/auth.module';
import { S3Module }   from '../../infrastructure/s3/s3.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Artist.name, schema: ArtistSchema }]),
    AuthModule,
    S3Module,
  ],
  controllers: [ArtistController],
  providers:   [ArtistService],
  exports:     [MongooseModule],
})

export class ArtistModule {}