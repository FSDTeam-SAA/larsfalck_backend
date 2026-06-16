import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configs from './config';
import { DatabaseModule }  from './infrastructure/database/database.module';
import { QueueModule }     from './infrastructure/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: configs, envFilePath: '.env' }),
    DatabaseModule,
    QueueModule,
  ],
})
class WorkerAppModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerAppModule);
  console.log('Worker is running and waiting for jobs...');
}

bootstrap();