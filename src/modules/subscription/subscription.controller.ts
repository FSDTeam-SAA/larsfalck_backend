import {
  Controller, Post, Get, Delete,
  Body, Headers, Req, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';
import { JwtAuthGuard }  from '../../common/guards/jwt-auth.guard';
import { Public }        from '../../common/decorators/public.decorator';
import { CurrentUser }   from '../../common/decorators/current-user.decorator';

class CreateCheckoutDto {
  @IsString() @IsNotEmpty() @IsMongoId()
  planId: string;
}

@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // User initiates checkout
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  createCheckout(
    @CurrentUser('_id') userId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionService.createCheckout(userId, dto.planId);
  }

  // Stripe calls this — must be Public + raw body
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.subscriptionService.handleWebhook(req.rawBody, signature);
  }

  // Get own subscription status
  @Get('me')
  getMySubscription(@CurrentUser('_id') userId: string) {
    return this.subscriptionService.getMySubscription(userId);
  }

  // Cancel subscription
  @Delete('cancel')
  @HttpCode(HttpStatus.OK)
  cancelSubscription(@CurrentUser('_id') userId: string) {
    return this.subscriptionService.cancelSubscription(userId);
  }
}