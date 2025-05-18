import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppConfigService } from './modules/core/modules/config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      // Show error messages
      disableErrorMessages: false,
      // If user send extra data from the dto the data will be stripped
      whitelist: true,
      // To enable auto-transformation, set transform to true
      transform: true,
    }),
  );

  app.use(helmet());

  const appConfigService = app.get(AppConfigService);

  const port = appConfigService.getServicePort || 3000;

  console.log(`app running on port:::`, port);
  await app.listen(port);
}

bootstrap();
