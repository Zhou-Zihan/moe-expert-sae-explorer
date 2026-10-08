import { useEffect, useMemo, useRef, useState } from 'react';
import { quadtree, select, zoom, zoomIdentity, type ZoomTransform } from 'd3';
import { useDispatch, useSelector } from 'react-redux';
import {
  skipToken,
  useGetDatasetsQuery,
  useGetProjectionQuery,
  useGetSamplesQuery,
} from '../api/dataApi';
import type { RootState } from '../app/store';
import { selectProjectionPoint } from '../app/uiSlice';
import { Panel } from '../components/Panel';
import './ProjectionPanel.css';

type Point = {
  sampleId: string;
  domainId: string;
  tokenIndex: number;
  x: number;
  y: number;
};
type Size = { width: number; height: number };
type Hover = { point: Point; x: number; y: number };

function contextFor(canvas: HTMLCanvasElement, size: Size) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(size.width * ratio));
  canvas.height = Math.max(1, Math.round(size.height * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  return ctx;
}

export function ProjectionPanel() {
  const dispatch = useDispatch();
  const { datasetId, domainIds, domainId, sampleId, tokenIndex, searchQuery } =
    useSelector((state: RootState) => state.ui);
  const activeQuery = searchQuery.trim();
  const { data: datasets } = useGetDatasetsQuery();
  const dataset = datasets?.find((item) => item.id === datasetId);
  const query =
    datasetId && domainIds.length ? { datasetId, domainIds } : skipToken;
  const {
    currentData: projection,
    isFetching,
    isError,
    refetch,
  } = useGetProjectionQuery(query);
  const { currentData: matchingSamples } = useGetSamplesQuery(
    datasetId && domainIds.length && activeQuery
      ? { datasetId, domainIds, query: activeQuery }
      : skipToken,
  );
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => setHover(null), [activeQuery]);

  useEffect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: canvas.clientWidth, height: canvas.clientHeight }),
    );
    observer.observe(canvas);
    setSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    return () => observer.disconnect();
  }, [canvas]);

  const colors = useMemo(
    () =>
      new Map(
        dataset?.domains.map((domain) => [domain.id, domain.color]) ?? [],
      ),
    [dataset],
  );
  const prepared = useMemo(() => {
    if (!projection?.pointCount) return null;
    const points: Point[] = [];
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const sample of projection.samples) {
      for (const [tokenIndex, x, y] of sample.points) {
        points.push({
          sampleId: sample.sampleId,
          domainId: sample.domainId,
          tokenIndex,
          x,
          y,
        });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      points,
      minX,
      maxX,
      minY,
      maxY,
      index: quadtree<Point>()
        .x((p) => p.x)
        .y((p) => p.y)
        .addAll(points),
    };
  }, [projection]);
  const matches = useMemo(
    () =>
      new Map(
        matchingSamples?.map((sample) => [
          `${sample.domainId}:${sample.sampleId}`,
          new Set(sample.matchTokenIndices),
        ]) ?? [],
      ),
    [matchingSamples],
  );
  const searchPoints = useMemo(() => {
    if (!activeQuery || !prepared) return null;
    const points = prepared.points.filter((point) =>
      matches.get(`${point.domainId}:${point.sampleId}`)?.has(point.tokenIndex),
    );
    return {
      points,
      index: quadtree<Point>()
        .x((p) => p.x)
        .y((p) => p.y)
        .addAll(points),
    };
  }, [activeQuery, matches, prepared]);
  const fit = useMemo(() => {
    if (!prepared || !size.width || !size.height) return null;
    const spanX = Math.max(prepared.maxX - prepared.minX, 1e-6);
    const spanY = Math.max(prepared.maxY - prepared.minY, 1e-6);
    const scale = Math.min(
      (size.width - 44) / spanX,
      (size.height - 44) / spanY,
    );
    return {
      scale,
      offsetX: (size.width - spanX * scale) / 2 - prepared.minX * scale,
      offsetY: (size.height - spanY * scale) / 2 - prepared.minY * scale,
    };
  }, [prepared, size]);
  const selectedSample = projection?.samples.find(
    (sample) => sample.sampleId === sampleId && sample.domainId === domainId,
  );
  const screen = (x: number, y: number): [number, number] => [
    view.applyX((fit?.offsetX ?? 0) + x * (fit?.scale ?? 1)),
    view.applyY((fit?.offsetY ?? 0) + y * (fit?.scale ?? 1)),
  ];

  useEffect(() => {
    if (!canvas || !projection) return;
    const behavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.5, 30])
      .clickDistance(4)
      .filter(
        (event) =>
          event.type === 'wheel' ||
          (event.type === 'mousedown' && event.button === 0),
      )
      .on('zoom', (event) => setView(event.transform));
    select(canvas).call(behavior).call(behavior.transform, zoomIdentity);
    return () => {
      select(canvas).on('.zoom', null);
    };
  }, [canvas, projection]);

  useEffect(() => {
    if (!canvas || !projection || !fit || !size.width) return;
    const frame = requestAnimationFrame(() => {
      const ctx = contextFor(canvas, size);
      if (!ctx) return;
      // Search mode keeps the global token cloud for context. Drawing every
      // trajectory would create tens of thousands of crossing segments.
      const allCanvas = activeQuery ? document.createElement('canvas') : null;
      const allCtx = allCanvas ? contextFor(allCanvas, size) : ctx;
      if (!allCtx) return;
      if (!activeQuery) {
        allCtx.lineWidth = 0.7;
        for (const sample of projection.samples) {
          if (!sample.points.length) continue;
          allCtx.beginPath();
          sample.points.forEach(([token, x, y], index) => {
            const [px, py] = screen(x, y);
            if (!index || token !== sample.points[index - 1][0] + 1)
              allCtx.moveTo(px, py);
            else allCtx.lineTo(px, py);
          });
          allCtx.strokeStyle = colors.get(sample.domainId) ?? '#777';
          allCtx.globalAlpha = 0.008;
          allCtx.stroke();
        }
      }
      allCtx.globalAlpha = activeQuery ? 1 : 0.09;
      for (const point of prepared?.points ?? []) {
        const [x, y] = screen(point.x, point.y);
        if (x < -2 || x > size.width + 2 || y < -2 || y > size.height + 2)
          continue;
        allCtx.fillStyle = activeQuery
          ? '#747b82'
          : (colors.get(point.domainId) ?? '#777');
        allCtx.fillRect(x, y, 1.4, 1.4);
      }
      if (activeQuery) {
        ctx.globalAlpha = 0.055;
        ctx.drawImage(allCanvas!, 0, 0, size.width, size.height);
        const filteredCanvas = document.createElement('canvas');
        const filteredCtx = contextFor(filteredCanvas, size);
        if (!filteredCtx) return;
        filteredCtx.lineWidth = 0.9;
        for (const sample of projection.samples) {
          const hits = matches.get(`${sample.domainId}:${sample.sampleId}`);
          if (!hits) continue;
          // Only the immediate token neighborhood of a hit gets a path.
          // The complete trajectory remains visible for the selected sample.
          filteredCtx.strokeStyle = colors.get(sample.domainId) ?? '#777';
          for (const hit of hits) {
            const hitPosition = sample.points.findIndex(
              ([token]) => token === hit,
            );
            if (hitPosition < 0) continue;
            const start = Math.max(0, hitPosition - 2);
            const end = Math.min(sample.points.length - 1, hitPosition + 2);
            filteredCtx.beginPath();
            for (let index = start; index <= end; index++) {
              const [token, x, y] = sample.points[index];
              const [px, py] = screen(x, y);
              if (index === start || token !== sample.points[index - 1][0] + 1)
                filteredCtx.moveTo(px, py);
              else filteredCtx.lineTo(px, py);
            }
            filteredCtx.stroke();
          }
          filteredCtx.fillStyle = colors.get(sample.domainId) ?? '#777';
          for (const [, x, y] of sample.points) {
            const [px, py] = screen(x, y);
            filteredCtx.fillRect(px, py, 1.5, 1.5);
          }
        }
        ctx.globalAlpha = 0.105;
        ctx.drawImage(filteredCanvas, 0, 0, size.width, size.height);
      }
      ctx.globalAlpha = 1;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    activeQuery,
    canvas,
    colors,
    fit,
    matches,
    prepared,
    projection,
    size,
    view,
  ]);

  useEffect(() => {
    if (!overlayRef.current || !fit || !size.width) return;
    const frame = requestAnimationFrame(() => {
      const ctx = contextFor(overlayRef.current!, size);
      if (!ctx) return;
      if (selectedSample?.points.length) {
        const color = colors.get(selectedSample.domainId) ?? '#4778ae';
        ctx.beginPath();
        selectedSample.points.forEach(([token, x, y], index) => {
          const [px, py] = screen(x, y);
          if (!index || token !== selectedSample.points[index - 1][0] + 1)
            ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = activeQuery ? 0.3 : 1;
        ctx.stroke();
        ctx.fillStyle = color;
        for (const [, x, y] of selectedSample.points) {
          const [px, py] = screen(x, y);
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, 2 * Math.PI);
          ctx.fill();
        }
        const start = selectedSample.points[0];
        const end = selectedSample.points[selectedSample.points.length - 1];
        const [startX, startY] = screen(start[1], start[2]);
        const [endX, endY] = screen(end[1], end[2]);
        ctx.beginPath();
        ctx.arc(startX, startY, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillRect(endX - 4, endY - 4, 8, 8);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(endX - 4, endY - 4, 8, 8);
        ctx.globalAlpha = 1;
      }
      if (activeQuery && searchPoints?.points.length) {
        const markers = searchPoints.points.map((point) => {
          const [x, y] = screen(point.x, point.y);
          return { point, x, y };
        });
        const cellSize = 12;
        const cells = new Map<string, number[]>();
        markers.forEach(({ x, y }, index) => {
          const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
          const cell = cells.get(key) ?? [];
          cell.push(index);
          cells.set(key, cell);
        });
        const crowded = markers.map(({ x, y }, index) => {
          const col = Math.floor(x / cellSize);
          const row = Math.floor(y / cellSize);
          let nearby = 0;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (const otherIndex of cells.get(`${col + dx}:${row + dy}`) ??
                []) {
                if (otherIndex === index) continue;
                const other = markers[otherIndex];
                if ((other.x - x) ** 2 + (other.y - y) ** 2 < 100) nearby++;
                if (nearby >= 3) return true;
              }
            }
          }
          return false;
        });
        // Dense groups use smaller marks; all halos are drawn before centers.
        ctx.fillStyle = '#fff';
        markers.forEach(({ x, y }, index) => {
          ctx.beginPath();
          ctx.arc(x, y, crowded[index] ? 2.8 : 5.2, 0, 2 * Math.PI);
          ctx.fill();
        });
        markers.forEach(({ point, x, y }, index) => {
          ctx.beginPath();
          ctx.arc(x, y, crowded[index] ? 1.9 : 3.4, 0, 2 * Math.PI);
          ctx.fillStyle = colors.get(point.domainId) ?? '#3b5b7a';
          ctx.fill();
        });
      }
      const current = selectedSample?.points.find(
        ([token]) => token === tokenIndex,
      );
      if (current) {
        const [x, y] = screen(current[1], current[2]);
        ctx.beginPath();
        ctx.arc(x, y, 6.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#c66b3d';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      if (hover) {
        const [x, y] = screen(hover.point.x, hover.point.y);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#c66b3d';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    activeQuery,
    colors,
    fit,
    hover,
    searchPoints,
    selectedSample,
    size,
    tokenIndex,
    view,
  ]);

  function pointNear(clientX: number, clientY: number): Hover | null {
    if (!canvas || !fit || !prepared) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left,
      y = clientY - rect.top;
    if (activeQuery) {
      const rawX = (view.invertX(x) - fit.offsetX) / fit.scale;
      const rawY = (view.invertY(y) - fit.offsetY) / fit.scale;
      const point = searchPoints?.index.find(
        rawX,
        rawY,
        9 / (fit.scale * view.k),
      );
      if (!point) return null;
      const [px, py] = screen(point.x, point.y);
      return Math.hypot(px - x, py - y) <= 9 ? { point, x, y } : null;
    }
    // Favor the visible selected trajectory when several projected points overlap.
    if (selectedSample) {
      let nearest: Point | null = null;
      let nearestDistance = 7;
      for (const [token, px, py] of selectedSample.points) {
        const [sx, sy] = screen(px, py);
        const distance = Math.hypot(sx - x, sy - y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = {
            sampleId: selectedSample.sampleId,
            domainId: selectedSample.domainId,
            tokenIndex: token,
            x: px,
            y: py,
          };
        }
      }
      if (nearest) return { point: nearest, x, y };
    }
    const rawX = (view.invertX(x) - fit.offsetX) / fit.scale;
    const rawY = (view.invertY(y) - fit.offsetY) / fit.scale;
    const point = prepared.index.find(rawX, rawY, 9 / (fit.scale * view.k));
    if (!point) return null;
    const [px, py] = screen(point.x, point.y);
    return Math.hypot(px - x, py - y) <= 9 ? { point, x, y } : null;
  }

  function choose(point: Point) {
    dispatch(
      selectProjectionPoint({
        domainId: point.domainId,
        sampleId: point.sampleId,
        tokenIndex: point.tokenIndex,
      }),
    );
  }

  return (
    <Panel title="Projection View" className="projection-panel">
      <div className="projection-content">
        <div className="projection-toolbar">
          <div className="projection-legend" aria-label="Domain legend">
            {dataset?.domains
              .filter((domain) => domainIds.includes(domain.id))
              .map((domain) => (
                <span className="projection-legend-item" key={domain.id}>
                  <span
                    className="projection-legend-dot"
                    style={{ backgroundColor: domain.color }}
                    aria-hidden="true"
                  />
                  {domain.name}
                </span>
              ))}
          </div>
          {projection && (
            <span className="projection-count">
              {activeQuery
                ? `${matchingSamples?.length ?? 0} samples · ${searchPoints?.points.length ?? 0} matches`
                : `${projection.samples.length} samples · ${projection.pointCount.toLocaleString()} tokens`}
            </span>
          )}
        </div>
        <div className="projection-plot">
          <canvas
            ref={setCanvas}
            className="projection-canvas"
            role="img"
            aria-label="Token routing projection. Scroll to zoom, drag to pan, click a token to select it. Arrow keys move within the selected sample."
            tabIndex={0}
            onPointerMove={(event) =>
              setHover(pointNear(event.clientX, event.clientY))
            }
            onPointerLeave={() => setHover(null)}
            onClick={(event) => {
              const hit = pointNear(event.clientX, event.clientY);
              if (hit) choose(hit.point);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                return;
              event.preventDefault();
              if (!selectedSample) return;
              const current = selectedSample.points.findIndex(
                ([token]) => token === tokenIndex,
              );
              const next =
                selectedSample.points[
                  current + (event.key === 'ArrowRight' ? 1 : -1)
                ];
              if (next)
                choose({
                  sampleId: selectedSample.sampleId,
                  domainId: selectedSample.domainId,
                  tokenIndex: next[0],
                  x: next[1],
                  y: next[2],
                });
            }}
          />
          <canvas
            ref={overlayRef}
            className="projection-overlay"
            aria-hidden="true"
          />
          {hover && (
            <div
              className="projection-tooltip"
              style={{
                left: Math.min(hover.x + 12, size.width - 170),
                top: Math.min(hover.y + 12, size.height - 42),
              }}
            >
              {hover.point.sampleId} · token #
              {String(hover.point.tokenIndex).padStart(3, '0')}
            </div>
          )}
          {isError ? (
            <div className="projection-message" role="alert">
              Projection unavailable. Run{' '}
              <code>pipeline/build_projection.py</code>, then{' '}
              <button type="button" onClick={refetch}>
                retry
              </button>
              .
            </div>
          ) : !datasetId || !domainIds.length ? (
            <div className="projection-message">
              Select a domain to view the projection.
            </div>
          ) : isFetching && !projection ? (
            <div className="projection-message">Loading projection…</div>
          ) : projection && !projection.pointCount ? (
            <div className="projection-message">
              No projected tokens for this domain.
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
