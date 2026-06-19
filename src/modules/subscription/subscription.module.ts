import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService }    from './subscription.service';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Plan, PlanSchema } from '../plan/schemas/plan.schema';
import { AuthModule }    from '../auth/auth.module';
import { StripeModule }  from '../../infrastructure/stripe/stripe.module';
import { QueueModule }   from '../../infrastructure/queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
    AuthModule,
    StripeModule,
    QueueModule,
  ],
  controllers: [SubscriptionController],
  providers:   [SubscriptionService],
  exports:     [SubscriptionService],
})

export class SubscriptionModule {}