import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationController } from './organization.controller';
import { OrganizationService }    from './organization.service';
import { Organization, OrganizationSchema } from './schemas/organization.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Plan, PlanSchema } from '../plan/schemas/plan.schema';
import { AuthModule }   from '../auth/auth.module';
import { StripeModule } from '../../infrastructure/stripe/stripe.module';
import { EmailModule }  from '../../infrastructure/email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: User.name,         schema: UserSchema         },
      { name: Plan.name,         schema: PlanSchema         },
    ]),
    AuthModule,
    StripeModule,
    EmailModule,
  ],
  controllers: [OrganizationController],
  providers:   [OrganizationService],
  exports:     [MongooseModule, OrganizationService],
})

export class OrganizationModule {}