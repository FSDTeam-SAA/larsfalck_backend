import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { RoleType } from '../../../common/enums/role.enum';
import { BCRYPT_ROUNDS } from '../../../core/constants';


@Schema({ _id: false })
export class Address {
  @Prop({ default: '' }) country:    string;
  @Prop({ default: '' }) cityState:  string;
  @Prop({ default: '' }) roadArea:   string;
  @Prop({ default: '' }) postalCode: string;
  @Prop({ default: '' }) taxId:      string;
}

export const AddressSchema = SchemaFactory.createForClass(Address);


@Schema({ timestamps: true })
export class User {
  @Prop({ required: true }) name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true, select: false }) password: string;

  @Prop({ trim: true })   username?: string;
  @Prop({ default: null }) dob?: Date;
  @Prop({ default: null }) phone?: string;

  @Prop({ enum: ['male', 'female', 'other'], default: 'male' })
  gender: string;

  @Prop({ type: String, enum: Object.values(RoleType), default: RoleType.USER })
  role: RoleType;

  @Prop({ default: null }) stripeAccountId?: string;
  @Prop({ default: '' })   bio?: string;
  @Prop({ type: AddressSchema, default: () => ({}) }) address?: Address;

  @Prop({ default: '' })               profileImage?: string;
  @Prop({ type: [String], default: [] }) multiProfileImage: string[];
  @Prop({ default: '' })               pdfFile?: string;

  @Prop({ default: null })  otp?: string;
  @Prop({ default: null })  otpExpires?: Date;
  @Prop({ default: false }) otpVerified: boolean;
  @Prop({ default: null })  resetExpires?: Date;
  @Prop({ default: false }) isVerified: boolean;

  @Prop({ default: null }) refreshToken?: string;

  @Prop({ default: false }) hasActiveSubscription: boolean;

  @Prop({
  type: {
    planId:                { type: Types.ObjectId, ref: 'Plan', default: null },
    startDate:             { type: Date, default: null },
    endDate:               { type: Date, default: null },
    stripeCustomerId:      { type: String, default: '' },
    stripeSubscriptionId:  { type: String, default: '' },
    status: {
      type:    String,
      enum:    ['trial', 'active', 'expired', 'cancelled'],
      default: 'trial',
    },
  },
    default: () => ({
      planId: null, startDate: null, endDate: null,
      stripeCustomerId: '', stripeSubscriptionId: '', status: 'trial',
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

  @Prop({ default: null })
  trialEndsAt?: Date;

  @Prop({ default: null })  subscriptionExpireDate?: Date;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  blockedUsers: Types.ObjectId[];

  @Prop({ default: 'en' }) language: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Song' }], default: [] })
 favoriteSongs: Types.ObjectId[];

 @Prop({ type: [{ type: Types.ObjectId, ref: 'Album' }], default: [] })
 favoriteAlbums: Types.ObjectId[];

 @Prop({ type: [{ type: Types.ObjectId, ref: 'Genre' }], default: [] })
 preferredGenres: Types.ObjectId[];

  @Prop({
    type: [{
      song:     { type: Types.ObjectId, ref: 'Song' },
      playedAt: { type: Date, default: Date.now },
    }],
    default: [],
  })
  recentlyPlayed: { song: Types.ObjectId; playedAt: Date }[];

  comparePassword:    (plain: string) => Promise<boolean>;
  generateAccessToken:  (payload: object, secret: string, expiresIn: string) => string;
  generateRefreshToken: (payload: object, secret: string, expiresIn: string) => string;
}

export const UserSchema  = SchemaFactory.createForClass(User);
export type UserDocument = HydratedDocument<User>;   // This is similer to IUser interface but with added methods and properties from Mongoose like _id, save(), etc.


UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  next();
});


UserSchema.methods.comparePassword = function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.password);
};


UserSchema.methods.generateAccessToken = function (
  payload:   object,
  secret:    string,
  expiresIn: string,
): string {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as any });
};


UserSchema.methods.generateRefreshToken = function (
  payload:   object,
  secret:    string,
  expiresIn: string,
): string {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as any });
};
