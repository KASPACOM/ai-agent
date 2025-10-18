import { Module } from '@nestjs/common';
import { QdrantModule } from './qdrant/qdrant.module';
import { MongoDbModule } from './mongodb/mongodb.module';

/**
 * Database Module
 *
 * Central module for all database services:
 * - Vector databases (Qdrant) - for embeddings and semantic search
 * - Document databases (MongoDB) - for raw data and metadata storage
 *
 * This module provides database services that any other module can use.
 */
@Module({
  imports: [QdrantModule, MongoDbModule],
  exports: [QdrantModule, MongoDbModule],
})
export class DatabaseModule {}
