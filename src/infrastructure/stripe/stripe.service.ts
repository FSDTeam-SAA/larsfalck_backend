import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StripeService implements OnModuleInit {
  private stripe: any;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe');
    this.stripe = new Stripe(
      this.configService.get<string>('stripe.secretKey')!,
      { apiVersion: '2026-05-27.dahlia' },
    );
  }

  // ─── Checkout ─────────────────────────────────────────────────────────────

  async createCheckoutSession(params: {
    priceId:    string;
    userId:     string;
    userEmail:  string;
    planId:     string;
    successUrl: string;
    cancelUrl:  string;
    mode:       string;
  }): Promise<any> {
    return this.stripe.checkout.sessions.create({
      mode:                 params.mode,
      payment_method_types: ['card'],
      customer_email:       params.userEmail,
      line_items:           [{ price: params.priceId, quantity: 1 }],
      metadata: {
        userId: params.userId,
        planId: params.planId,
      },
      success_url: params.successUrl,
      cancel_url:  params.cancelUrl,
    });
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  constructWebhookEvent(payload: Buffer, signature: string, secret: string): any {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  async getSubscription(subscriptionId: string): Promise<any> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string): Promise<any> {
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  // ─── Products & Prices (auto-managed, admin never touches Stripe) ─────────

  async createProductWithPrice(params: {
    name:         string;
    amount:       number;
    billingCycle: string;
  }): Promise<string> {
    const product = await this.stripe.products.create({
      name: params.name,
    });

    const price = await this.stripe.prices.create({
      product:     product.id,
      unit_amount: Math.round(params.amount * 100),
      currency:    'usd',
      recurring: {
        interval: params.billingCycle === 'yearly' ? 'year' : 'month',
      },
    });

    return price.id;
  }

  async updatePrice(params: {
    oldPriceId:   string;
    productName:  string;
    amount:       number;
    billingCycle: string;
  }): Promise<string> {
    // archive old price — Stripe doesn't allow editing existing prices
    if (params.oldPriceId) {
      await this.stripe.prices.update(params.oldPriceId, { active: false });
    }

    // find existing product by name or create new one
    const products = await this.stripe.products.search({
      query: `name:'${params.productName}'`,
    });

    let productId: string;
    if (products.data.length > 0) {
      productId = products.data[0].id;
    } else {
      const product = await this.stripe.products.create({ name: params.productName });
      productId = product.id;
    }

    // create new price under that product
    const price = await this.stripe.prices.create({
      product:     productId,
      unit_amount: Math.round(params.amount * 100),
      currency:    'usd',
      recurring: {
        interval: params.billingCycle === 'yearly' ? 'year' : 'month',
      },
    });

    return price.id;
  }
}