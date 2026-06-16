import appConfig        from './app.config';
import authConfig       from './auth.config';
import cloudinaryConfig from './cloudinary.config';
import databaseConfig   from './database.config';
import emailConfig      from './email.config';
import s3Config         from './s3.config';
import redisConfig      from './redis.config';

export {
  appConfig, authConfig, cloudinaryConfig,
  databaseConfig, emailConfig, s3Config, redisConfig,
};

export default [
  appConfig, authConfig, cloudinaryConfig,
  databaseConfig, emailConfig, s3Config, redisConfig,
];