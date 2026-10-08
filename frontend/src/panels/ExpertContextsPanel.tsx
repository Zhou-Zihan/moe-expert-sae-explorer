import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import {
  skipToken,
  useGetExpertContextsQuery,
  type ContextExample,
} from '../api/dataApi';
import type { RootState } from '../app/store';
import { Panel } from '../components/Panel';
import './ExpertContextsPanel.css';

function sampleLabel(sampleId: string, domainId: string): string {
  const prefix = `${domainId}_`;
  const suffix = sampleId.startsWith(prefix)
    ? sampleId.slice(prefix.length)
    : '';
  return /^\d+$/.test(suffix)
    ? `#${Number(suffix).toString().padStart(3, '0')}`
    : sampleId;
}

type HoveredExample = {
  example: ContextExample;
  left: number;
  edge: number;
  above: boolean;
  maxHeight: number;
};

function ExampleRow({
  example,
  onShow,
  onHide,
}: {
  example: ContextExample;
  onShow: (example: ContextExample, element: HTMLElement) => void;
  onHide: () => void;
}) {
  const fullSentence = `${example.sentenceBefore}${example.sentenceHighlight}${example.sentenceAfter}`;
  return (
    <li
      className="expert-context-example"
      tabIndex={0}
      aria-label={`${example.sampleId}, token ${example.tokenIndex}, routing weight ${example.weight.toFixed(2)}. ${fullSentence}`}
      onMouseEnter={(event) => onShow(example, event.currentTarget)}
      onMouseLeave={onHide}
      onFocus={(event) => onShow(example, event.currentTarget)}
      onBlur={onHide}
    >
      <span className="expert-context-sample">
        {sampleLabel(example.sampleId, example.domainId)}
      </span>
      <span className="expert-context-snippet">
        <span className="expert-context-before">{example.before}</span>
        <mark>{example.highlight || ' '}</mark>
        <span className="expert-context-after">{example.after}</span>
      </span>
      <span className="expert-context-weight">{example.weight.toFixed(2)}</span>
    </li>
  );
}

export function ExpertContextsPanel() {
  const [hovered, setHovered] = useState<HoveredExample | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    datasetId,
    domainIds,
    sampleId,
    tokenIndex,
    layerIndex,
    routingExperts,
  } = useSelector((state: RootState) => state.ui);
  const query =
    datasetId && sampleId && layerIndex !== null && routingExperts.length
      ? {
          datasetId,
          domainIds,
          layerIndex,
          expertIds: routingExperts.map((expert) => expert.expertId),
        }
      : skipToken;
  const { currentData, isFetching, isError, refetch } =
    useGetExpertContextsQuery(query);

  useEffect(() => {
    setHovered(null);
  }, [currentData]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  function cancelHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }

  function scheduleHide() {
    cancelHide();
    hideTimer.current = setTimeout(() => setHovered(null), 160);
  }

  function showExample(example: ContextExample, element: HTMLElement) {
    cancelHide();
    const rect = element.getBoundingClientRect();
    const width = Math.min(440, window.innerWidth - 24);
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 12),
    );
    const spaceBelow = window.innerHeight - rect.bottom - 14;
    const spaceAbove = rect.top - 14;
    const above = spaceBelow < 220 && spaceAbove > spaceBelow;
    setHovered({
      example,
      left,
      edge: above ? window.innerHeight - rect.top + 6 : rect.bottom + 6,
      above,
      maxHeight: Math.max(100, Math.min(360, above ? spaceAbove : spaceBelow)),
    });
  }

  return (
    <Panel
      title={`Expert Contexts${layerIndex === null ? '' : ` · Layer ${layerIndex}`}`}
      className="expert-contexts-panel"
    >
      {isError ? (
        <p className="expert-contexts-message" role="alert">
          Unable to load expert contexts.{' '}
          <button type="button" onClick={refetch}>
            Retry
          </button>
        </p>
      ) : !sampleId || layerIndex === null || !routingExperts.length ? (
        <p className="expert-contexts-message">
          Select a sample, token, and heatmap layer to view expert contexts.
        </p>
      ) : !currentData ? (
        <p className="expert-contexts-message">
          {isFetching ? 'Loading expert contexts…' : 'No expert contexts.'}
        </p>
      ) : (
        <div
          className="expert-contexts-grid"
          aria-label={`Expert contexts for ${sampleId}, token ${tokenIndex}, layer ${layerIndex}`}
        >
          {routingExperts.map((routed, index) => {
            const context = currentData.experts.find(
              (item) => item.expertId === routed.expertId,
            );
            const totalSelections = context?.selectionCount ?? 0;
            const showDomainMix = (context?.domainMix.length ?? 0) > 1;
            return (
              <article
                className="expert-context-card"
                key={routed.expertId}
                aria-label={`Rank ${index + 1}, expert ${routed.expertId}, routing weight ${routed.weight.toFixed(4)}`}
              >
                <header className="expert-context-card-header">
                  <span className="expert-context-rank">{index + 1}</span>
                  <strong>E{String(routed.expertId).padStart(3, '0')}</strong>
                  <span className="expert-context-count">
                    {totalSelections.toLocaleString()} tokens
                  </span>
                </header>
                <ol
                  className="expert-context-examples"
                  aria-label="Highest-weight examples from distinct samples"
                  onScroll={() => setHovered(null)}
                >
                  {context?.examples.map((example) => (
                    <ExampleRow
                      key={`${example.domainId}:${example.sampleId}`}
                      example={example}
                      onShow={showExample}
                      onHide={scheduleHide}
                    />
                  ))}
                </ol>
                {showDomainMix && (
                  <div className="expert-context-domain-mix">
                    <span>Domain mix</span>
                    <div className="expert-context-domain-bar">
                      {context?.domainMix.map((domain, domainIndex) => (
                        <span
                          key={domain.domainId}
                          style={{
                            flex: domain.selectionCount,
                            backgroundColor: [
                              '#4778ae',
                              '#d08b26',
                              '#529685',
                              '#aa5262',
                              '#8063a4',
                              '#8b983b',
                            ][domainIndex % 6],
                          }}
                          title={`${domain.domainId}: ${domain.selectionCount} tokens`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {hovered &&
        createPortal(
          <div
            id="expert-context-tooltip"
            className="expert-context-tooltip"
            role="tooltip"
            style={{
              left: hovered.left,
              [hovered.above ? 'bottom' : 'top']: hovered.edge,
              maxHeight: hovered.maxHeight,
            }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            <div className="expert-context-tooltip-header">
              <span>
                {sampleLabel(
                  hovered.example.sampleId,
                  hovered.example.domainId,
                )}{' '}
                · token #{hovered.example.tokenIndex}
              </span>
              <span>weight {hovered.example.weight.toFixed(2)}</span>
            </div>
            <p>
              {hovered.example.sentenceBefore}
              <mark>{hovered.example.sentenceHighlight || ' '}</mark>
              {hovered.example.sentenceAfter}
            </p>
          </div>,
          document.body,
        )}
    </Panel>
  );
}
