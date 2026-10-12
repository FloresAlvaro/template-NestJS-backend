import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  app.enableCors({
    origin: 'http://localhost:3000',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  const config = new DocumentBuilder()
    .setTitle('Template Backend')
    .setDescription('API documentation for the Template Backend')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document);
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
