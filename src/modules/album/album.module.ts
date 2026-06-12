import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlbumController } from './album.controller';
import { AlbumService }    from './album.service';
import { Album, AlbumSchema } from './schemas/album.schema';
import { AuthModule } from '../auth/auth.module';
import { S3Module }   from '../../infrastructure/s3/s3.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Album.name, schema: AlbumSchema }]),
    AuthModule,
    S3Module,
  ],
  controllers: [AlbumController],
  providers:   [AlbumService],
  exports:     [MongooseModule],
})

export class AlbumModule {}