import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      bufferLogs: true,
    });
    app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
    app.use(helmet());
    app.use(compression());


    const configService = app.get(ConfigService);
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

    const allowedOrigins = configService.get<string>('ALLOWED_ORIGINS')?.split(',').filter(Boolean) || [];
    app.enableCors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    });

    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,               // strips any properties not defined in the DTO
      forbidNonWhitelisted: true,    // returns 400 if unknown properties are sent
    }));
    app.setGlobalPrefix('api');

    const config = new DocumentBuilder()
      .setTitle('Public Awareness API')
      .setDescription('Civic Issue Reporting System API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    await app.listen(process.env.PORT || 3000, '0.0.0.0');
    Logger.log(`Application is running on port: ${process.env.PORT || 3000}`, 'Bootstrap');
  } catch (error) {
    Logger.error('Error during application bootstrap:', error, 'Bootstrap');
    process.exit(1);
  }
}
bootstrap();
