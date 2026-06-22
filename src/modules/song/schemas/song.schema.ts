import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SongDocument = HydratedDocument<Song>;

@Schema({ timestamps: true })
export class Song {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Artist' }], default: [] })
  artists: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Album' }], default: [] })
  albums: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Genre' }], default: [] })
  genres: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Tag' }], default: [] })
  tags: Types.ObjectId[];

  @Prop({ required: true })
  audioFile: string;

  @Prop({ required: true })
  audioKey: string;

  @Prop({ default: '' })
  coverImage: string;

  @Prop({ default: '' })
  coverImageKey: string;

  @Prop({ default: 0 })
  duration: number;   // seconds — set manually or extracted later

  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status: string;

  @Prop({ default: 0 })
  playCount: number;
}

export const SongSchema = SchemaFactory.createForClass(Song);

// Text index for full-text search on name
SongSchema.index({ name: 'text' });