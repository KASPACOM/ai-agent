export interface CrawlPolicy {
  startUrl: string;
  maxDepth: number;
  maxRequests: number;
  sameDomain: boolean;
  sameSubdomains: boolean;
  include?: string[]; // regex strings
  exclude?: string[]; // regex strings
  respectRobotsTxt: boolean;
  userAgent?: string;
}