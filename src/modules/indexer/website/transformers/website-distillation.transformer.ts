import {
  MasterDocument,
  ProcessingStatus,
} from '../../shared/models/master-document.model';
import { MessageSource } from '../../shared/models/message-source.enum';
import { DistillationResultItem } from '../models/website-distillation.model';

export class WebsiteDistillationTransformer {
  static toMasterDocuments(params: {
    url: string;
    clusterId: string | number;
    clusterSize: number;
    method: any;
    silhouette: number;
    intraClusterDistance: number;
    items: DistillationResultItem[];
    fallbackUrls: string[];
  }): MasterDocument[] {
    const hostname = new URL(params.url).hostname;
    return params.items.map((item) => {
      const doc: MasterDocument = {
        id: `website_distilled_${params.clusterId}_${Math.random()
          .toString(36)
          .slice(2)}`,
        source: MessageSource.WEBSITE,
        text: item.text,
        author: hostname,
        authorHandle: hostname,
        createdAt: new Date().toISOString(),
        url: params.url,
        processingStatus: ProcessingStatus.PROCESSED,
        processedAt: new Date().toISOString(),
        kaspaRelated: false,
        kaspaTopics: [],
        hashtags: [],
        mentions: [],
        links: [],
        language: 'en',
        errors: [],
        retryCount: 0,
        websiteRootUrl: params.url,
        websitePageUrls: item.sourceUrls?.length
          ? item.sourceUrls
          : params.fallbackUrls,
        websiteClusterId: String(params.clusterId),
        websiteClusterSize: params.clusterSize,
        websiteClusterMethod: params.method,
        websiteSilhouetteScore: params.silhouette,
        websiteIntraClusterDistance: params.intraClusterDistance,
        websiteSectionTitle: item.title,
        websiteDistilledTrackingId: item.trackingId,
        websiteDistilledOrder: item.order,
        websiteTopics: item.topics || [],
        websiteKeywords: item.keywords || [],
      };
      return doc;
    });
  }
}
