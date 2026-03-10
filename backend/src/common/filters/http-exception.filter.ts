import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
    };

    // Log all errors
    if (httpStatus >= 400) {
      this.logger.error(
        `${httpStatus} Error on ${responseBody.path}: ${
          exception instanceof Error ? exception.message : JSON.stringify(exception)
        }`
      );
      if (httpStatus >= 500 && exception instanceof Error && exception.stack) {
        this.logger.error(exception.stack);
      }
      if (httpStatus === 400 && exception instanceof HttpException) {
        this.logger.error(JSON.stringify(exception.getResponse()));
      }
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
