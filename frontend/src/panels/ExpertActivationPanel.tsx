import { useEffect, useMemo, useState } from 'react';
import { interpolateRgb, scaleLinear } from 'd3';
import { useDispatch, useSelector } from 'react-redux';
import {
  skipToken,
  useGetTokenRoutingQuery,
  type RoutedExpert,
} from '../api/dataApi';
import type { RootState } from '../app/store';
import { selectLayerRouting } from '../app/uiSlice';
import { Panel } from '../components/Panel';
import './ExpertActivationPanel.css';

const CHART = { left: 45, top: 16, width: 555, height: 435 };
const SELECTED_COLOR = '#C66B3D';

function positionExpertLabels(experts: RoutedExpert[], expertCount: number) {
  const minimumGap = 12;
  const labels = experts.map((expert) => {
    const rowY =
      CHART.top + ((expert.expertId + 0.5) * CHART.height) / expertCount;
    return { expertId: expert.expertId, rowY, labelY: rowY };
  });

  for (let index = 1; index < labels.length; index += 1) {
    labels[index].labelY = Math.max(
      labels[index].labelY,
      labels[index - 1].labelY + minimumGap,
    );
  }
  if (
    labels.length &&
    labels[labels.length - 1].labelY > CHART.top + CHART.height
  ) {
    labels[labels.length - 1].labelY = CHART.top + CHART.height;
    for (let index = labels.length - 2; index >= 0; index -= 1) {
      labels[index].labelY = Math.min(
        labels[index].labelY,
        labels[index + 1].labelY - minimumGap,
      );
    }
  }
  return labels;
}

export function ExpertActivationPanel() {
  const dispatch = useDispatch();
  const {
    datasetId,
    domainId,
    sampleId,
    tokenIndex,
    layerIndex,
    routingExperts,
  } = useSelector((state: RootState) => state.ui);
  const [fullRange, setFullRange] = useState(false);
  const routingQuery =
    datasetId && domainId && sampleId
      ? { datasetId, domainId, sampleId, tokenIndex }
      : skipToken;
  const {
    currentData: routing,
    isFetching,
    isError,
    refetch,
  } = useGetTokenRoutingQuery(routingQuery);

  useEffect(() => {
    if (!routing) return;
    const layer =
      routing.layers[
        layerIndex === null || layerIndex >= routing.layerCount
          ? Math.min(30, routing.layerCount - 1)
          : layerIndex
      ];
    if (
      layerIndex !== layer.layerIndex ||
      routingExperts.length !== layer.experts.length ||
      layer.experts.some(
        (expert) =>
          !routingExperts.some(
            (selected) =>
              selected.expertId === expert.expertId &&
              selected.weight === expert.weight,
          ),
      )
    ) {
      dispatch(
        selectLayerRouting({
          layerIndex: layer.layerIndex,
          experts: layer.experts,
        }),
      );
    }
  }, [dispatch, layerIndex, routing, routingExperts]);

  const maxWeight = fullRange ? 1 : 0.4;
  const color = useMemo(
    () =>
      scaleLinear<string>()
        .domain([0, maxWeight])
        .range(['#F7F4EE', '#3B5B7A'])
        .interpolate(interpolateRgb)
        .clamp(true),
    [maxWeight],
  );
  const selectedLayerIndex = routing
    ? Math.min(layerIndex ?? 30, routing.layerCount - 1)
    : null;
  const selectedExperts =
    routing?.layers
      .find((layer) => layer.layerIndex === selectedLayerIndex)
      ?.experts.slice()
      .sort((a, b) => a.expertId - b.expertId) ?? [];
  const selectedExpertLabels = positionExpertLabels(
    selectedExperts,
    routing?.expertCount ?? 1,
  );

  return (
    <Panel
      title="Expert Activation Heatmap"
      className="expert-activation-panel"
    >
      {isError ? (
        <p className="heatmap-message" role="alert">
          Unable to load routing data.{' '}
          <button type="button" onClick={refetch}>
            Retry
          </button>
        </p>
      ) : !sampleId ? (
        <p className="heatmap-message">
          Select a sample to view expert routing.
        </p>
      ) : !routing ? (
        <p className="heatmap-message">
          {isFetching ? 'Loading expert routing…' : 'No routing data.'}
        </p>
      ) : (
        <div className="heatmap-content">
          <div className="heatmap-toolbar">
            <span className="heatmap-token" title={routing.token}>
              Token #{String(routing.tokenIndex).padStart(3, '0')} ·{' '}
              {routing.token}
            </span>
            <div
              className="heatmap-legend"
              aria-label={`Routing weight 0 to ${maxWeight}`}
            >
              <span>0</span>
              <span className="heatmap-gradient" aria-hidden="true" />
              <span>{maxWeight.toFixed(1)}</span>
              <span className="heatmap-legend-title">Routing weight</span>
              <button
                type="button"
                className="heatmap-range-button"
                onClick={() => setFullRange((current) => !current)}
                aria-label={
                  fullRange
                    ? 'Use enhanced 0 to 0.4 color range'
                    : 'Use full 0 to 1 color range'
                }
                title={
                  fullRange ? 'Use enhanced 0–0.4 range' : 'Use full 0–1 range'
                }
              >
                {fullRange ? 'Enhance' : 'Full 0–1'}
              </button>
            </div>
          </div>
          <div className="heatmap-chart-scroll">
            <svg
              className="heatmap-chart"
              viewBox="0 0 650 480"
              role="group"
              aria-label={`Expert activation heatmap for sample ${routing.sampleId}, token ${routing.tokenIndex}; selected layer ${selectedLayerIndex}.`}
            >
              <text
                className="heatmap-axis-title heatmap-y-title"
                x="12"
                y="98"
                transform="rotate(90 12 98)"
              >
                Expert ID
              </text>
              <text className="heatmap-axis-title" x="620" y="470">
                Layer
              </text>
              {routing.layers.map((layer) => {
                const x =
                  CHART.left +
                  (layer.layerIndex * CHART.width) / routing.layerCount;
                const cellWidth = CHART.width / routing.layerCount;
                const weightsByExpert = new Map(
                  layer.experts.map((expert) => [
                    expert.expertId,
                    expert.weight,
                  ]),
                );
                return (
                  <g
                    key={layer.layerIndex}
                    className="heatmap-column"
                    role="button"
                    tabIndex={0}
                    aria-pressed={layer.layerIndex === selectedLayerIndex}
                    onClick={() =>
                      dispatch(
                        selectLayerRouting({
                          layerIndex: layer.layerIndex,
                          experts: layer.experts,
                        }),
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        dispatch(
                          selectLayerRouting({
                            layerIndex: layer.layerIndex,
                            experts: layer.experts,
                          }),
                        );
                      }
                    }}
                    aria-label={`Select layer ${layer.layerIndex}`}
                  >
                    {Array.from(
                      { length: routing.expertCount },
                      (_, expertId) => {
                        const weight = weightsByExpert.get(expertId) ?? 0;
                        return (
                          <rect
                            key={expertId}
                            x={x}
                            y={
                              CHART.top +
                              (expertId * CHART.height) / routing.expertCount
                            }
                            width={cellWidth + 0.15}
                            height={CHART.height / routing.expertCount + 0.1}
                            fill={color(weight)}
                          >
                            {weight > 0 && (
                              <title>{`Layer ${layer.layerIndex} · Expert ${expertId} · routing weight ${weight.toFixed(4)}`}</title>
                            )}
                          </rect>
                        );
                      },
                    )}
                  </g>
                );
              })}
              {selectedLayerIndex !== null && (
                <rect
                  x={
                    CHART.left +
                    (selectedLayerIndex * CHART.width) / routing.layerCount
                  }
                  y={CHART.top - 1}
                  width={CHART.width / routing.layerCount}
                  height={CHART.height + 2}
                  fill="none"
                  stroke={SELECTED_COLOR}
                  strokeWidth="1.6"
                  pointerEvents="none"
                />
              )}
              {[0, 16, 32, 48, 64, 80, 96, 112, routing.expertCount - 1]
                .filter(
                  (expertId, index, ticks) =>
                    expertId < routing.expertCount &&
                    ticks.indexOf(expertId) === index,
                )
                .map((expertId) => (
                  <text
                    key={expertId}
                    className="heatmap-tick heatmap-y-tick"
                    x={CHART.left - 5}
                    y={
                      CHART.top +
                      ((expertId + 0.5) * CHART.height) / routing.expertCount +
                      3
                    }
                  >
                    {expertId}
                  </text>
                ))}
              {Array.from({ length: routing.layerCount }, (_, layer) => layer)
                .filter(
                  (layer) =>
                    layer % 6 === 0 ||
                    layer === routing.layerCount - 1 ||
                    layer === selectedLayerIndex,
                )
                .map((layer) => (
                  <text
                    key={layer}
                    className={`heatmap-tick heatmap-x-tick${layer === selectedLayerIndex ? ' is-selected' : ''}`}
                    x={
                      CHART.left +
                      ((layer + 0.5) * CHART.width) / routing.layerCount
                    }
                    y={CHART.top + CHART.height + 17}
                  >
                    {layer}
                  </text>
                ))}
              {selectedExpertLabels.map(({ expertId, rowY, labelY }) => (
                <g key={expertId} className="heatmap-selected-expert">
                  <line
                    x1={CHART.left + CHART.width + 2}
                    x2={CHART.left + CHART.width + 8}
                    y1={rowY}
                    y2={labelY}
                  />
                  <text x={CHART.left + CHART.width + 12} y={labelY + 3}>
                    {expertId}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          {!fullRange && (
            <span className="heatmap-scale-note">
              Values above 0.4 use the darkest color; hover a selected cell for
              its exact weight.
            </span>
          )}
        </div>
      )}
    </Panel>
  );
}
