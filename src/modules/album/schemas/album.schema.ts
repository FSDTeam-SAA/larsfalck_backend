import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AlbumDocument = HydratedDocument<Album>;

@Schema({ timestamps: true })
export class Album {
  @Prop({ required: true, trim: true })
  name: string;

  // Multiple artist references (stored as ObjectIds, resolved on query)
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Artist' }], default: [] })
  artists: Types.ObjectId[];

  @Prop({ default: null })
  releaseDate?: Date;

  @Prop({ default: '' })
  coverImage: string;

  @Prop({ default: '' })
  coverImageKey: string;   // S3 key for clean deletion

  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status: string;

  @Prop({ default: '' })
  description?: string;
}

export const AlbumSchema = SchemaFactory.createForClass(Album);