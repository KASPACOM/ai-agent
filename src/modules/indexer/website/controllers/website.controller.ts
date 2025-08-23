import { Body, Controller, Post } from '@nestjs/common';
import { WebsiteIndexerService } from '../services/website-indexer.service';
import { WebsiteIndexRequest } from '../models/website-index.model';

@Controller('indexer/website')
export class WebsiteController {
  constructor(private readonly websiteIndexer: WebsiteIndexerService) {}

  @Post()
  async indexWebsite(@Body() body: WebsiteIndexRequest) {
    return this.websiteIndexer.indexWebsite({
      url: body.url,
      depth: body.depth,
      k: body.k,
      method: body.method,
      reembedFinal: body.reembedFinal,
    });
  }
}
