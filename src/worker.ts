import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configs from './config';
import { LoggerModule }                from './common/logger/logger.module';
import { DatabaseModule }              from './infrastructure/database/database.module';
import { QueueModule }                 from './infrastructure/queue/queue.module';
import { QueueProducerService }        from './infrastructure/queue/queue-producer.service';
import { SubscriptionProducerService } from './infrastructure/queue/subscription-producer.service';
import { RedisModule } from './infrastructure/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: configs, envFilePath: '.env' }),
    LoggerModule,
    DatabaseModule,
    RedisModule,
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

  console.log('Worker running — expiry check at 9am, play count sync every 5 mins');
}

bootstrap();