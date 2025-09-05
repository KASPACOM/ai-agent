export interface DistilledItem {
  title?: string;
  topics: string[];
  keywords: string[];
  sourceUrls: string[];
  text: string;
}

export interface DistillationResultItem extends DistilledItem {
  trackingId: string;
  order: string; // e.g. "1/3"
}
