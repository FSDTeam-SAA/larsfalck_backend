import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  orgCode: string;

  @Prop({ default: 0 })
  maxSeats: number;

  @Prop({ default: 0 })
  usedSeats: number;

  @Prop({
    type: {
      planId:               { type: Types.ObjectId, ref: 'Plan', default: null },
      startDate:            { type: Date, default: null },
      endDate:              { type: Date, default: null },
      stripeCustomerId:     { type: String, default: '' },
      stripeSubscriptionId: { type: String, default: '' },
      status: {
        type:    String,
        enum:    ['trial', 'active', 'expired', 'cancelled'],
        default: 'inactive',
      },
    },
    default: () => ({
      planId: null, startDate: null, endDate: null,
      stripeCustomerId: '', stripeSubscriptionId: '', status: 'inactive',
    }),
  })
  subscription: {
    planId:               Types.ObjectId;
    startDate:            Date;
    endDate:              Date;
    stripeCustomerId:     string;
    stripeSubscriptionId: string;
    status:               string;
  };

  @Prop({ type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' })
  status: string;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
OrganizationSchema.index({ orgCode: 1 });
OrganizationSchema.index({ ownerId: 1 });