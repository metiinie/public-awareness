import { Controller, Post, UseInterceptors, UploadedFile, UseGuards, BadRequestException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
    private readonly logger = new Logger(UploadController.name);
    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Upload a file to Cloudinary' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @UseInterceptors(FileInterceptor('file')) // Storage is now handled globally in UploadModule
    uploadFile(@UploadedFile() file: any) {
        if (!file || !file.path) {
            this.logger.error('[UploadController] Invalid file received in request');
            throw new BadRequestException('File upload failed or no file received');
        }
        this.logger.log(`[UploadController] File uploaded successfully: ${file.path}`);
        return {
            url: file.path,
        };
    }
}
