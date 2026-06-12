import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ArtistDocument = HydratedDocument<Artist>;

@Schema({ timestamps: true })
export class Artist {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description?: string;

  @Prop({ default: '' })
  image: string;

  @Prop({ default: '' })
  imageKey: string;   // S3 object key — needed for clean deletion

  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status: string;
}

export const ArtistSchema = SchemaFactory.createForClass(Artist);