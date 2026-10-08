import { skipToken } from '@reduxjs/toolkit/query';
import { baseApi } from './baseApi';

export type DomainSummary = {
  id: string;
  name: string;
  color: string;
  sampleCount: number;
};

export type DatasetSummary = {
  id: string;
  name: string;
  modelName: string;
  layerCount: number;
  expertCount: number;
  routingTopK: number;
  saeTopK: number;
  domains: DomainSummary[];
};

export type SampleSummary = {
  sampleId: string;
  domainId: string;
  textPreview: string;
  tokenCount: number;
  matchTokenIndices: number[];
  matchCount: number;
  matchBefore: string;
  matchText: string;
  matchAfter: string;
};

export type SampleDetail = SampleSummary & {
  text: string;
  tokens: string[];
  tokenTexts: string[];
  source: string;
  documentId: string;
  streamIndex: number;
  chunkTokenStart: number;
  chunkTokenEnd: number;
};

export type RoutedExpert = {
  expertId: number;
  weight: number;
  rank: number;
};

export type LayerRouting = {
  layerIndex: number;
  experts: RoutedExpert[];
};

export type TokenRouting = {
  sampleId: string;
  tokenIndex: number;
  token: string;
  layerCount: number;
  expertCount: number;
  routingTopK: number;
  layers: LayerRouting[];
};

export type ContextExample = {
  sampleId: string;
  domainId: string;
  tokenIndex: number;
  weight: number;
  before: string;
  highlight: string;
  after: string;
  sentenceBefore: string;
  sentenceHighlight: string;
  sentenceAfter: string;
};

export type ExpertContext = {
  expertId: number;
  selectionCount: number;
  domainMix: { domainId: string; selectionCount: number }[];
  examples: ContextExample[];
};

export type ExpertContexts = {
  layerIndex: number;
  experts: ExpertContext[];
};

export type SaeFeature = {
  rank: number;
  featureId: number;
  activation: number;
  semantics: string | null;
};

export type TokenSaeFeatures = {
  sampleId: string;
  tokenIndex: number;
  layerIndex: number;
  features: SaeFeature[];
};

export type ProjectionSample = {
  sampleId: string;
  domainId: string;
  points: [number, number, number][];
};

export type ProjectionData = {
  datasetId: string;
  method: string;
  pointCount: number;
  samples: ProjectionSample[];
};

type DomainKey = { datasetId: string; domainId: string };
type SampleListKey = { datasetId: string; domainIds: string[]; query: string };
type SampleKey = DomainKey & { sampleId: string };
type TokenRoutingKey = SampleKey & { tokenIndex: number };
type TokenSaeFeaturesKey = TokenRoutingKey & { layerIndex: number };
type ExpertContextsKey = {
  datasetId: string;
  domainIds: string[];
  layerIndex: number;
  expertIds: number[];
};

export const dataApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDatasets: build.query<DatasetSummary[], void>({
      query: () => '/datasets',
    }),
    getProjection: build.query<
      ProjectionData,
      { datasetId: string; domainIds: string[] }
    >({
      query: ({ datasetId, domainIds }) => ({
        url: `/datasets/${encodeURIComponent(datasetId)}/projection`,
        params: { domains: domainIds.join(',') },
      }),
    }),
    getSamples: build.query<SampleSummary[], SampleListKey>({
      query: ({ datasetId, domainIds, query }) => ({
        url: `/datasets/${encodeURIComponent(datasetId)}/samples`,
        params: { domains: domainIds.join(','), ...(query ? { query } : {}) },
      }),
    }),
    getSample: build.query<SampleDetail, SampleKey>({
      query: ({ datasetId, domainId, sampleId }) =>
        `/datasets/${encodeURIComponent(datasetId)}/domains/${encodeURIComponent(domainId)}/samples/${encodeURIComponent(sampleId)}`,
    }),
    getTokenRouting: build.query<TokenRouting, TokenRoutingKey>({
      query: ({ datasetId, domainId, sampleId, tokenIndex }) =>
        `/datasets/${encodeURIComponent(datasetId)}/domains/${encodeURIComponent(domainId)}/samples/${encodeURIComponent(sampleId)}/tokens/${tokenIndex}/routing`,
    }),
    getExpertContexts: build.query<ExpertContexts, ExpertContextsKey>({
      query: ({ datasetId, domainIds, layerIndex, expertIds }) => ({
        url: `/datasets/${encodeURIComponent(datasetId)}/layers/${layerIndex}/expert-contexts`,
        params: { domains: domainIds.join(','), experts: expertIds.join(',') },
      }),
    }),
    getTokenSaeFeatures: build.query<TokenSaeFeatures, TokenSaeFeaturesKey>({
      query: ({ datasetId, domainId, sampleId, tokenIndex, layerIndex }) => ({
        url: `/datasets/${encodeURIComponent(datasetId)}/domains/${encodeURIComponent(domainId)}/samples/${encodeURIComponent(sampleId)}/tokens/${tokenIndex}/sae-features`,
        params: { layer: layerIndex },
      }),
    }),
  }),
});

export const {
  useGetDatasetsQuery,
  useGetProjectionQuery,
  useGetSamplesQuery,
  useGetSampleQuery,
  useGetTokenRoutingQuery,
  useGetExpertContextsQuery,
  useGetTokenSaeFeaturesQuery,
} = dataApi;

export { skipToken };
