import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HomepageCacheDocument = HydratedDocument<HomepageCache>;

@Schema({ timestamps: true })
export class HomepageCache {
  @Prop({
    required: true,
    unique: true,
    enum: ['popular_songs', 'popular_artists', 'popular_albums'],
  })
  section: string;

  @Prop({ type: [], default: [] })
  items: any[];

  @Prop({ default: null })
  computedAt: Date;
}

export const HomepageCacheSchema = SchemaFactory.createForClass(HomepageCache);