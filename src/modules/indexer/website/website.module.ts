import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { WebsiteController } from './controllers/website.controller';
import { WebsiteClusteringService } from './services/website-clustering.service';
import { WebsiteIndexerService } from './services/website-indexer.service';
import { GenericCrawlerService } from './services/generic-crawler.service';
import { ApifyCrawlerService } from './services/apify-crawler.service';
import { LlmModule } from '../../llm/llm.module';
import { WebsiteSummarizerService } from './services/website-summarizer.service';
import { WebsiteDedupService } from './services/website-dedup.service';

@Module({
  imports: [SharedModule, LlmModule],
  controllers: [WebsiteController],
  providers: [
    WebsiteIndexerService,
    WebsiteClusteringService,
    GenericCrawlerService,
    ApifyCrawlerService,
    WebsiteSummarizerService,
    WebsiteDedupService,
  ],
  exports: [WebsiteIndexerService],
})
export class WebsiteModule {}
