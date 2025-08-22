declare module 'langchain/document' {
  export class Document {
    pageContent: string;
    metadata: any;
    constructor(init: { pageContent: string; metadata?: any });
  }
}

declare module 'langchain/text_splitter' {
  export class RecursiveCharacterTextSplitter {
    constructor(init: { chunkSize: number; chunkOverlap: number });
    splitDocuments(docs: any[]): Promise<any[]>;
  }
}


