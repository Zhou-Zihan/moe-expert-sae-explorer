import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RoutedExpert } from '../api/dataApi';

const DEFAULT_TOKEN_INDEX = 42;

type SelectionState = {
  datasetId: string | null;
  domainIds: string[];
  domainId: string | null;
  sampleId: string | null;
  tokenIndex: number;
  layerIndex: number | null;
  routingExperts: RoutedExpert[];
  expertId: number | null;
  featureId: number | null;
  searchQuery: string;
};

const initialState: SelectionState = {
  datasetId: null,
  domainIds: [],
  domainId: null,
  sampleId: null,
  tokenIndex: DEFAULT_TOKEN_INDEX,
  layerIndex: null,
  routingExperts: [],
  expertId: null,
  featureId: null,
  searchQuery: '',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    selectDataset(
      state,
      action: PayloadAction<{ datasetId: string; domainIds: string[] }>,
    ) {
      state.datasetId = action.payload.datasetId;
      state.domainIds = action.payload.domainIds;
      state.domainId = null;
      state.sampleId = null;
      state.tokenIndex = DEFAULT_TOKEN_INDEX;
      state.layerIndex = null;
      state.routingExperts = [];
      state.expertId = null;
      state.featureId = null;
      state.searchQuery = '';
    },
    toggleDomain(state, action: PayloadAction<string>) {
      const domainId = action.payload;
      if (state.domainIds.includes(domainId)) {
        state.domainIds = state.domainIds.filter((id) => id !== domainId);
        if (state.domainId === domainId) {
          state.domainId = null;
          state.sampleId = null;
          state.tokenIndex = DEFAULT_TOKEN_INDEX;
          state.layerIndex = null;
          state.routingExperts = [];
          state.expertId = null;
          state.featureId = null;
        }
      } else {
        state.domainIds.push(domainId);
      }
    },
    selectSample(
      state,
      action: PayloadAction<{ sampleId: string; domainId: string } | null>,
    ) {
      state.sampleId = action.payload?.sampleId ?? null;
      state.domainId = action.payload?.domainId ?? null;
      state.tokenIndex = DEFAULT_TOKEN_INDEX;
      state.layerIndex = null;
      state.routingExperts = [];
      state.expertId = null;
      state.featureId = null;
    },
    selectToken(state, action: PayloadAction<number>) {
      state.tokenIndex = action.payload;
      state.routingExperts = [];
      state.expertId = null;
      state.featureId = null;
    },
    selectProjectionPoint(
      state,
      action: PayloadAction<{
        domainId: string;
        sampleId: string;
        tokenIndex: number;
      }>,
    ) {
      state.domainId = action.payload.domainId;
      state.sampleId = action.payload.sampleId;
      state.tokenIndex = action.payload.tokenIndex;
      if (!state.searchQuery) state.layerIndex = null;
      state.routingExperts = [];
      state.expertId = null;
      state.featureId = null;
    },
    selectLayer(state, action: PayloadAction<number | null>) {
      state.layerIndex = action.payload;
      state.routingExperts = [];
      state.expertId = null;
      state.featureId = null;
    },
    selectLayerRouting(
      state,
      action: PayloadAction<{ layerIndex: number; experts: RoutedExpert[] }>,
    ) {
      state.layerIndex = action.payload.layerIndex;
      state.routingExperts = action.payload.experts
        .slice()
        .sort((left, right) => right.weight - left.weight);
      state.expertId = null;
      state.featureId = null;
    },
    selectExpert(state, action: PayloadAction<number | null>) {
      state.expertId = action.payload;
      state.featureId = null;
    },
    selectFeature(state, action: PayloadAction<number | null>) {
      state.featureId = action.payload;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    selectSearchMatch(
      state,
      action: PayloadAction<{
        domainId: string;
        sampleId: string;
        tokenIndex: number;
      }>,
    ) {
      state.domainId = action.payload.domainId;
      state.sampleId = action.payload.sampleId;
      state.tokenIndex = action.payload.tokenIndex;
      state.layerIndex = 0;
      state.routingExperts = [];
      state.expertId = null;
      state.featureId = null;
    },
  },
});

export const {
  selectDataset,
  toggleDomain,
  selectSample,
  selectToken,
  selectProjectionPoint,
  selectLayer,
  selectLayerRouting,
  selectExpert,
  selectFeature,
  setSearchQuery,
  selectSearchMatch,
} = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
