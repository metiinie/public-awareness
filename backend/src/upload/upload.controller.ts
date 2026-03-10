import { Controller, Post, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { S3Client } from '@aws-sdk/client-s3';
// @ts-ignore
import * as multerS3Pkg from 'multer-s3';
const multerS3 = (multerS3Pkg as any).default || multerS3Pkg;

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});

@ApiTags('upload')
@Controller('upload')
export class UploadController {
    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Upload a file to S3' })
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
    @UseInterceptors(
        FileInterceptor('file', {
            storage: multerS3({
                s3: s3,
                bucket: process.env.AWS_S3_BUCKET || 'civicwatch-bucket',
                acl: 'public-read',
                key: function (req, file, cb) {
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                    cb(null, `uploads/${uniqueSuffix}${extname(file.originalname)}`);
                },
            }),
        }),
    )
    uploadFile(@UploadedFile() file: any) {
        return {
            url: file.location, // multerS3 exposes the public URL as `location`
        };
    }
}
