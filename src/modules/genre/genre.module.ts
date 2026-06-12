import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GenreController } from './genre.controller';
import { GenreService }    from './genre.service';
import { Genre, GenreSchema } from './schemas/genre.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Genre.name, schema: GenreSchema }]),
    AuthModule,
  ],
  controllers: [GenreController],
  providers:   [GenreService],
  exports:     [MongooseModule],
})

export class GenreModule {}