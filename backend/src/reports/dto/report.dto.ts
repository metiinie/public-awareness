import { IsString, IsNotEmpty, IsInt, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReportDto {
  @ApiProperty({ example: 'Pothole on Main St' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Large pothole causing traffic delays.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  categoryId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  cityId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  areaId: number;

  @ApiProperty({ type: [String], example: ['https://example.com/image.jpg'] })
  @IsArray()
  mediaUrls: string[];
}

export class FilterReportDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  cityId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  areaId?: number;

  @ApiPropertyOptional({ enum: ['PENDING', 'VERIFIED', 'SOLVED', 'ARCHIVED'] })
  @IsOptional()
  @IsString()
  status?: string;
}
