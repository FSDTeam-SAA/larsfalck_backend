import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlanDocument = HydratedDocument<Plan>;

@Schema({ timestamps: true })
export class Plan {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 0 })
  price: number;

  // price per seat for org plans
  @Prop({ default: 0 })
  pricePerSeat: number;

  @Prop({ type: String, enum: ['monthly', 'yearly'], required: true })
  billingCycle: string;

  @Prop({ type: String, enum: ['individual', 'organization'], default: 'individual' })
  planType: string;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ default: '' })
  stripePriceId: string;

  @Prop({ type: String, enum: ['active', 'inactive'], default: 'active' })
  status: string;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);