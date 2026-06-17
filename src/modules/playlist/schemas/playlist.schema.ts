import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PlaylistDocument = HydratedDocument<Playlist>;

@Schema({ timestamps: true })
export class Playlist {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  owner: Types.ObjectId;

  // admin = visible on public website, user = only on user dashboard
  @Prop({ type: String, enum: ['admin', 'user'], required: true })
  ownerType: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Song' }], default: [] })
  songs: Types.ObjectId[];

  // provided cover OR auto-resolved from first song
  @Prop({ default: '' })
  coverImage: string;

  @Prop({ default: '' })
  coverImageKey: string;

  // false = cover came from first song (not uploaded), true = user/admin uploaded it
  @Prop({ default: false })
  hasCustomCover: boolean;

  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status: string;

  @Prop({ default: '' })
  description?: string;
}

export const PlaylistSchema = SchemaFactory.createForClass(Playlist);