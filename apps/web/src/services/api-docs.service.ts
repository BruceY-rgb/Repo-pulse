import { toApiUrl } from '@/lib/desktop';

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  deprecated?: boolean;
  security?: unknown[];
}

export interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
  options?: OpenApiOperation;
  head?: OpenApiOperation;
}

export interface OpenApiDocument {
  openapi?: string;
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  paths?: Record<string, OpenApiPathItem>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
}

export const apiDocsService = {
  async getOpenApiDocument(): Promise<OpenApiDocument> {
    const response = await fetch(toApiUrl('/docs-json'), {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to load API documentation (${response.status})`);
    }

    return response.json() as Promise<OpenApiDocument>;
  },
};
