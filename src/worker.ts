import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configs from './config';
import { LoggerModule }                from './common/logger/logger.module';
import { DatabaseModule }              from './infrastructure/database/database.module';
import { QueueModule }                 from './infrastructure/queue/queue.module';
import { QueueProducerService }        from './infrastructure/queue/queue-producer.service';
import { SubscriptionProducerService } from './infrastructure/queue/subscription-producer.service';
import { HomeProducerService }         from './infrastructure/queue/home-producer.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: configs, envFilePath: '.env' }),
    LoggerModule,
    DatabaseModule,
    QueueModule,
  ],
})
class WorkerAppModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerAppModule);

  const subscriptionProducer = app.get(SubscriptionProducerService);
  await subscriptionProducer.scheduleExpiryCheck();

  const queueProducer = app.get(QueueProducerService);
  await queueProducer.schedulePlayCountSync();

  const homeProducer = app.get(HomeProducerService);
  await homeProducer.scheduleTrendingCompute();

  console.log([
    'Worker running',
    '→ Expiry check:       9am daily',
    '→ Play count sync:    every 5 mins',
    '→ Trending compute:   every 2 hours',
  ].join('\n'));
}

bootstrap();