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
      const request = ctx.getRequest();
      this.logger.error(
        `${httpStatus} Error on ${responseBody.path} [${request.method}]: ${
          exception instanceof Error ? exception.message : JSON.stringify(exception)
        }`
      );

      if (httpStatus >= 500) {
        this.logger.error(`Request Headers: ${JSON.stringify(request.headers)}`);
        if (request.body && Object.keys(request.body).length > 0) {
          this.logger.error(`Request Body: ${JSON.stringify(request.body)}`);
        }
        if (exception instanceof Error && exception.stack) {
          this.logger.error(exception.stack);
        }

        // Write to a debug file
        try {
          const fs = require('fs');
          const path = require('path');
          const logPath = path.join(process.cwd(), 'error_debug.log');
          const logEntry = `[${new Date().toISOString()}] 500 Error on ${responseBody.path} [${request.method}]\n` +
            `Error: ${exception instanceof Error ? exception.message : JSON.stringify(exception)}\n` +
            `Stack: ${exception instanceof Error ? exception.stack : 'No stack'}\n` +
            `Body: ${JSON.stringify(request.body)}\n` +
            `-------------------------------------------\n`;
          fs.appendFileSync(logPath, logEntry);
        } catch (e) {
          this.logger.error('Failed to write to debug log file', e);
        }
      }

      if (httpStatus === 400 && exception instanceof HttpException) {
        this.logger.error(`Validation Error: ${JSON.stringify(exception.getResponse())}`);
      }
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
