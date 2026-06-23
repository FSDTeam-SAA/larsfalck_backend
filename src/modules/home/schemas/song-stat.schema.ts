import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SongStatDocument = HydratedDocument<SongStat>;

@Schema({ timestamps: true })
export class SongStat {
  @Prop({ type: Types.ObjectId, ref: 'Song', required: true, unique: true })
  songId: Types.ObjectId;

  @Prop({ default: 0 }) plays24h:       number;
  @Prop({ default: 0 }) plays7d:        number;
  @Prop({ default: 0 }) plays30d:       number;
  @Prop({ default: 0 }) favoriteCount:  number;
  @Prop({ default: 0 }) playlistAdds:   number;
  @Prop({ default: 0 }) trendingScore:  number;
  @Prop({ default: null }) lastComputedAt: Date;
}

export const SongStatSchema = SchemaFactory.createForClass(SongStat);
SongStatSchema.index({ trendingScore: -1 });
SongStatSchema.index({ songId: 1 });