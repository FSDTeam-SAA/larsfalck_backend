import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GenreDocument = HydratedDocument<Genre>;

@Schema({ timestamps: true })
export class Genre {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status: string;
}

export const GenreSchema = SchemaFactory.createForClass(Genre);