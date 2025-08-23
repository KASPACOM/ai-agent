import { WebsiteClusteringMethod } from '../../shared/models/website-clustering-method.enum';

export interface ClusterInputChunk {
  id: string;
  text: string;
  url: string;
  embedding?: number[];
}

export interface ClusterResult {
  clusterId: string;
  method: WebsiteClusteringMethod;
  memberIds: string[];
  centroid?: number[];
  silhouette?: number;
  intraClusterDistance?: number;
}

export interface ClusterOptions {
  k?: number;
  method?: WebsiteClusteringMethod;
  autoKRange?: [number, number];
  subsampleSize?: number;
}
