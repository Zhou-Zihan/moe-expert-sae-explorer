import { useDispatch, useSelector } from 'react-redux';
import { skipToken, useGetTokenSaeFeaturesQuery } from '../api/dataApi';
import type { RootState } from '../app/store';
import { selectFeature } from '../app/uiSlice';
import { Panel } from '../components/Panel';
import './SaeFeaturesPanel.css';

export function SaeFeaturesPanel() {
  const dispatch = useDispatch();
  const { datasetId, domainId, sampleId, tokenIndex, layerIndex, featureId } =
    useSelector((state: RootState) => state.ui);
  const query =
    datasetId && domainId && sampleId && layerIndex !== null
      ? { datasetId, domainId, sampleId, tokenIndex, layerIndex }
      : skipToken;
  const { currentData, isFetching, isError, refetch } =
    useGetTokenSaeFeaturesQuery(query);
  const maxActivation = Math.max(
    0,
    ...(currentData?.features.map((feature) => feature.activation) ?? []),
  );
  const selectedFeatureId = featureId ?? currentData?.features[0]?.featureId;

  return (
    <Panel
      title={`SAE Features${layerIndex === null ? '' : ` · Layer ${layerIndex}`}`}
      className="sae-features-panel"
    >
      {isError ? (
        <p className="sae-features-message" role="alert">
          Unable to load SAE features.{' '}
          <button type="button" onClick={refetch}>
            Retry
          </button>
        </p>
      ) : !sampleId || layerIndex === null ? (
        <p className="sae-features-message">
          Select a sample, token, and heatmap layer to view SAE features.
        </p>
      ) : !currentData ? (
        <p className="sae-features-message">
          {isFetching ? 'Loading SAE features…' : 'No SAE features.'}
        </p>
      ) : (
        <div
          className="sae-features-table"
          aria-label={`Top SAE features for ${sampleId}, token ${tokenIndex}, layer ${layerIndex}`}
        >
          <div className="sae-features-table-head" aria-hidden="true">
            <span>#</span>
            <span>ID</span>
            <span>Semantics</span>
            <span>Activation</span>
          </div>
          <ol className="sae-features-list">
            {currentData.features.map((feature) => (
              <li key={feature.featureId}>
                <button
                  type="button"
                  className={`sae-feature-row${feature.featureId === selectedFeatureId ? ' is-selected' : ''}`}
                  aria-pressed={feature.featureId === selectedFeatureId}
                  aria-label={`Rank ${feature.rank}, feature ${feature.featureId}, activation ${feature.activation.toFixed(2)}${feature.semantics ? `, ${feature.semantics}` : ''}`}
                  onClick={() => dispatch(selectFeature(feature.featureId))}
                >
                  <span className="sae-feature-rank">{feature.rank}</span>
                  <span className="sae-feature-id">
                    F{String(feature.featureId).padStart(5, '0')}
                  </span>
                  <span
                    className="sae-feature-semantics"
                    title={feature.semantics ?? undefined}
                  >
                    {feature.semantics ?? ''}
                  </span>
                  <span className="sae-feature-activation">
                    <span className="sae-feature-bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${maxActivation > 0 ? Math.max(0, (feature.activation / maxActivation) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <span className="sae-feature-value">
                      {feature.activation.toFixed(2)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}
