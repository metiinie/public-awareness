import { IsString, IsNotEmpty, IsInt, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReportDto {
  @ApiProperty({ example: 'Pothole on Main St' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Large pothole causing traffic delays.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  categoryId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  cityId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  areaId: number;

  @ApiPropertyOptional({ example: 'INFO', enum: ['INFO', 'WARNING', 'CRITICAL'] })
  @IsOptional()
  @IsString()
  urgency?: string;

  @ApiPropertyOptional({ example: 'Near the blue building' })
  @IsOptional()
  @IsString()
  placeName?: string;

  @ApiProperty({ type: [String], example: ['https://example.com/image.jpg'] })
  @IsArray()
  mediaUrls: string[];
}

export class FilterReportDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  areaId?: number;

  @ApiPropertyOptional({ enum: ['PUBLISHED', 'UNDER_REVIEW', 'REMOVED', 'VERIFIED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['INFO', 'WARNING', 'CRITICAL'] })
  @IsOptional()
  @IsString()
  urgency?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reporterId?: number;

  @ApiPropertyOptional({ example: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'desc' })
  @IsOptional()
  @IsString()
  order?: string;

  @ApiPropertyOptional({ example: 'pothole' })
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  viewerId?: number;
}
