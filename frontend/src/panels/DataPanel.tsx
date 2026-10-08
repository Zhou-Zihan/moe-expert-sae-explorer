import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  skipToken,
  useGetDatasetsQuery,
  useGetSampleQuery,
  useGetSamplesQuery,
} from '../api/dataApi';
import type { RootState } from '../app/store';
import {
  selectDataset,
  selectProjectionPoint,
  selectSample,
  selectSearchMatch,
  setSearchQuery,
  toggleDomain,
} from '../app/uiSlice';
import { Panel } from '../components/Panel';
import './DataPanel.css';

function sampleLabel(sampleId: string, domainId: string): string {
  const prefix = `${domainId}_`;
  const suffix = sampleId.startsWith(prefix)
    ? sampleId.slice(prefix.length)
    : '';
  return /^\d+$/.test(suffix)
    ? `#${Number(suffix).toString().padStart(3, '0')}`
    : sampleId;
}

export function DataPanel() {
  const dispatch = useDispatch();
  const { datasetId, domainIds, domainId, sampleId, tokenIndex, searchQuery } =
    useSelector((state: RootState) => state.ui);
  const activeQuery = searchQuery.trim();
  const appliedSearch = useRef('');
  const selectedRow = useRef<HTMLDivElement | null>(null);

  const {
    data: datasets,
    isLoading: datasetsLoading,
    isError: datasetsError,
    refetch: refetchDatasets,
  } = useGetDatasetsQuery();
  const dataset = datasets?.find((item) => item.id === datasetId);

  useEffect(() => {
    if (datasets?.length && !dataset) {
      const first = datasets[0];
      dispatch(
        selectDataset({
          datasetId: first.id,
          domainIds: first.domains.map((domain) => domain.id),
        }),
      );
    }
  }, [dataset, datasets, dispatch]);

  const sampleQuery =
    dataset && domainIds.length
      ? { datasetId: dataset.id, domainIds, query: activeQuery }
      : skipToken;
  const {
    currentData: samples,
    isFetching: samplesFetching,
    isError: samplesError,
    refetch: refetchSamples,
  } = useGetSamplesQuery(sampleQuery);
  const { currentData: selectedDetail } = useGetSampleQuery(
    datasetId && domainId && sampleId
      ? { datasetId, domainId, sampleId }
      : skipToken,
  );

  useEffect(() => {
    if (!samples) return;
    if (activeQuery) {
      const key = `${datasetId}:${domainIds.join(',')}:${activeQuery}`;
      if (appliedSearch.current === key) return;
      appliedSearch.current = key;
      const first = samples[0];
      if (first?.matchTokenIndices.length) {
        dispatch(
          selectSearchMatch({
            sampleId: first.sampleId,
            domainId: first.domainId,
            tokenIndex: first.matchTokenIndices[0],
          }),
        );
      } else {
        dispatch(selectSample(null));
      }
      return;
    }
    appliedSearch.current = '';
    if (!sampleId && samples.length) {
      const first = samples[0];
      dispatch(
        selectSample(
          first ? { sampleId: first.sampleId, domainId: first.domainId } : null,
        ),
      );
    }
  }, [activeQuery, datasetId, dispatch, domainIds, sampleId, samples]);

  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: 'nearest' });
  }, [domainId, sampleId, samples]);

  function loadData() {
    refetchDatasets();
    if (dataset && domainIds.length) refetchSamples();
  }

  return (
    <Panel title="Data" className="data-panel">
      <div className="data-sections">
        <section className="data-section" aria-labelledby="dataset-heading">
          <h3 id="dataset-heading">Dataset</h3>
          {datasetsError ? (
            <div className="data-message" role="alert">
              Unable to load data. Start the backend, then{' '}
              <button type="button" onClick={refetchDatasets}>
                retry
              </button>
              .
            </div>
          ) : datasetsLoading || !dataset ? (
            <p className="data-message">Loading dataset…</p>
          ) : (
            <>
              {datasets && datasets.length > 1 && (
                <select
                  className="dataset-select"
                  aria-label="Dataset"
                  value={dataset.id}
                  onChange={(event) => {
                    const next = datasets.find(
                      (item) => item.id === event.target.value,
                    );
                    if (!next) return;
                    dispatch(
                      selectDataset({
                        datasetId: next.id,
                        domainIds: next.domains.map((domain) => domain.id),
                      }),
                    );
                  }}
                >
                  {datasets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
              <dl className="dataset-facts">
                <div>
                  <dt>Model</dt>
                  <dd>{dataset.modelName}</dd>
                </div>
                <div>
                  <dt>Routing</dt>
                  <dd>
                    {dataset.layerCount} L · {dataset.expertCount} E · top-
                    {dataset.routingTopK}
                  </dd>
                </div>
                <div>
                  <dt>SAE</dt>
                  <dd>top-{dataset.saeTopK} / layer</dd>
                </div>
              </dl>
              <div className="data-actions">
                <button type="button" onClick={loadData}>
                  Load data
                </button>
                <button
                  type="button"
                  disabled
                  title="Run the projection precomputation command in backend/README.md"
                >
                  Recompute projection
                </button>
              </div>
            </>
          )}
        </section>

        <section className="data-section" aria-labelledby="domain-heading">
          <h3 id="domain-heading">Domain</h3>
          <div className="domain-grid">
            {dataset?.domains.map((domain) => (
              <label className="domain-option" key={domain.id}>
                <input
                  type="checkbox"
                  checked={domainIds.includes(domain.id)}
                  onChange={() => dispatch(toggleDomain(domain.id))}
                />
                <span
                  className="domain-dot"
                  style={{ backgroundColor: domain.color }}
                  aria-hidden="true"
                />
                <span className="domain-name">{domain.name}</span>
                <span className="domain-count">{domain.sampleCount}</span>
              </label>
            ))}
          </div>
        </section>

        <section
          className="data-section data-section--samples"
          aria-labelledby="samples-heading"
        >
          <h3 id="samples-heading">Samples</h3>
          <input
            className="sample-search"
            type="search"
            aria-label="Search text or token"
            placeholder="Search text or token"
            value={searchQuery}
            onChange={(event) => dispatch(setSearchQuery(event.target.value))}
          />
          <span className="visually-hidden" aria-live="polite">
            {samples ? `${samples.length} samples` : ''}
          </span>
          {samplesError ? (
            <div className="data-message" role="alert">
              Unable to load samples.{' '}
              <button type="button" onClick={refetchSamples}>
                Retry
              </button>
              .
            </div>
          ) : !domainIds.length ? (
            <p className="data-message">Select a domain to view samples.</p>
          ) : samplesFetching && !samples ? (
            <p className="data-message">Loading samples…</p>
          ) : (
            <div className="sample-list" role="list">
              {samples?.map((sample) => {
                const domain = dataset?.domains.find(
                  (item) => item.id === sample.domainId,
                );
                const selected =
                  sample.sampleId === sampleId && sample.domainId === domainId;
                return (
                  <div
                    className="sample-list-item"
                    role="listitem"
                    key={`${sample.domainId}:${sample.sampleId}`}
                    ref={selected ? selectedRow : undefined}
                  >
                    <button
                      type="button"
                      className={`sample-button${selected ? ' is-selected' : ''}`}
                      aria-pressed={selected}
                      aria-label={`${sample.sampleId}, ${domain?.name ?? sample.domainId}: ${sample.textPreview}`}
                      title={sample.sampleId}
                      onClick={() => {
                        if (activeQuery && sample.matchTokenIndices.length) {
                          dispatch(
                            selectProjectionPoint({
                              sampleId: sample.sampleId,
                              domainId: sample.domainId,
                              tokenIndex: sample.matchTokenIndices[0],
                            }),
                          );
                        } else {
                          dispatch(
                            selectSample({
                              sampleId: sample.sampleId,
                              domainId: sample.domainId,
                            }),
                          );
                        }
                      }}
                    >
                      <span className="sample-meta">
                        <span className="sample-number">
                          {sampleLabel(sample.sampleId, sample.domainId)}
                        </span>
                        <span
                          className="domain-dot"
                          style={{
                            backgroundColor: domain?.color ?? '#8b7357',
                          }}
                          aria-hidden="true"
                        />
                        <span>{domain?.name ?? sample.domainId}</span>
                        {activeQuery && sample.matchCount > 1 && (
                          <span className="sample-match-count">
                            ×{sample.matchCount}
                          </span>
                        )}
                      </span>
                      <span className="sample-preview">
                        {activeQuery ? (
                          <>
                            {sample.matchBefore}
                            <mark>{sample.matchText}</mark>
                            {sample.matchAfter}
                          </>
                        ) : (
                          sample.textPreview
                        )}
                      </span>
                    </button>
                    {selected && selectedDetail && (
                      <div
                        className="sample-token-expansion"
                        aria-label={`Tokens in ${sample.sampleId}`}
                      >
                        {selectedDetail.tokenTexts.map((piece, index) => (
                          <button
                            type="button"
                            key={index}
                            className={`sample-token${index === tokenIndex ? ' is-current' : ''}${activeQuery && sample.matchTokenIndices.includes(index) ? ' is-match' : ''}`}
                            title={`Token #${index}: ${selectedDetail.tokens[index]}`}
                            aria-label={`Token ${index}, ${piece.trim() || selectedDetail.tokens[index]}`}
                            aria-pressed={index === tokenIndex}
                            onClick={() =>
                              dispatch(
                                selectProjectionPoint({
                                  sampleId: sample.sampleId,
                                  domainId: sample.domainId,
                                  tokenIndex: index,
                                }),
                              )
                            }
                          >
                            {piece || '·'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {samples && samples.length === 0 && (
                <p className="data-message">No matching samples.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </Panel>
  );
}
