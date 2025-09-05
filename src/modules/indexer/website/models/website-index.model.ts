import { WebsiteClusteringMethod } from '../../shared/models/website-clustering-method.enum';

export interface WebsiteIndexRequest {
  url: string;
  depth?: number;
  k?: number;
  method?: WebsiteClusteringMethod;
  reembedFinal?: boolean;
}

export interface WebsiteIndexOptions extends WebsiteIndexRequest {}
