import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { User, UserSchema } from '../auth/schemas/user.schema';
import { Song, SongSchema } from '../song/schemas/song.schema';
import { Plan, PlanSchema } from '../plan/schemas/plan.schema';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Song.name, schema: SongSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
    AuthModule,
  ],
  controllers: [AdminController],
  providers:   [AdminService],
})

export class AdminModule {}