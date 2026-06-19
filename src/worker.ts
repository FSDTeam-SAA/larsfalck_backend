import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configs from './config';
import { LoggerModule }          from './common/logger/logger.module';
import { DatabaseModule }        from './infrastructure/database/database.module';
import { QueueModule }           from './infrastructure/queue/queue.module';
import { SubscriptionProducerService } from './infrastructure/queue/subscription-producer.service';

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

  // schedule daily expiry check
  const producer = app.get(SubscriptionProducerService);
  await producer.scheduleExpiryCheck();

  console.log('Worker running — daily expiry check scheduled at 9am');
}

bootstrap();