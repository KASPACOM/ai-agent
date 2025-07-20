import { Module } from '@nestjs/common';
import { QdrantModule } from './qdrant/qdrant.module';

/**
 * Database Module
 *
 * Central module for all database services:
 * - Vector databases (Qdrant)
 * - Future: Traditional databases (PostgreSQL, MongoDB)
 * - Future: Cache databases (Redis)
 * - Future: Time-series databases
 *
 * This module provides database services that any other module can use.
 */
@Module({
  imports: [QdrantModule],
  exports: [QdrantModule],
})
export class DatabaseModule {}
