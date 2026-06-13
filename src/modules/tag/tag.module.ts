import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TagController } from './tag.controller';
import { TagService }    from './tag.service';
import { Tag, TagSchema } from './schemas/tag.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Tag.name, schema: TagSchema }]),
    AuthModule,
  ],
  controllers: [TagController],
  providers:   [TagService],
  exports:     [MongooseModule],
})

export class TagModule {}