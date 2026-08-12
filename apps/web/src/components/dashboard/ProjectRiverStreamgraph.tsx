/* eslint-disable @typescript-eslint/no-explicit-any */
// D3 internals (scales, area generators, brush, zoom) use polymorphic generics
// that TypeScript cannot safely infer. Suppressing explicit-any is the established
// pattern for D3 + TypeScript integration.
import { useEffect, useMemo, useRef, useState } from 'react';
import { extent, max, min } from 'd3-array';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { axisBottom } from 'd3-axis';
import { brushX as d3BrushX } from 'd3-brush';
import { pointer as d3Pointer, select } from 'd3-selection';
import {
  area as d3Area,
  curveBasis,
  stack as d3Stack,
  stackOffsetWiggle,
  stackOrderInsideOut,
} from 'd3-shape';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
type EventSeverity = 'positive' | 'warning' | 'info';

interface DailyRow {
  date: string;
  contributor: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  filesTouched: number;
  cumulativeCommits: number;
}

interface PivotedRow {
  date: Date;
  dateKey: string;
  [contributor: string]: Date | number | string;
}

interface ProjectEventMarker {
  id: string;
  date: string;
  title: string;
  description: string;
  type: string;
  severity: EventSeverity;
  selected: boolean;
}

interface StreamgraphTooltipState {
  contributor: string;
  date: string;
  commits: number;
  totalCommits: number;
  percentage: number;
  x: number;
  y: number;
}

interface ProjectRiverStreamgraphProps {
  colorMap: Map<string, string>;
  eventMarkers: ProjectEventMarker[];
  highlightedContributor: string | null;
  onHoverContributor: (payload: StreamgraphTooltipState | null) => void;
  onHoverEvent: (event: ProjectEventMarker | null, coords: { x: number; y: number } | null) => void;
  onRangeChange: (range: { start: string; end: string } | null) => void;
  rows: DailyRow[];
  t: (key: string, params?: Record<string, string>) => string;
  visibleRange: { start: string; end: string } | null;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

// Chart layout constants
const MARGIN = { top: 24, right: 24, bottom: 24, left: 48 };
const BRUSH_HEIGHT = 50;
const BRUSH_GAP = 16;
const MAX_CONTRIBUTOR_LABELS = 8;
const MAX_SPIKE_MARKERS = 5;

// Theme configuration
const getChartColors = (isDark: boolean) => {
  return isDark
    ? {
        axisColor: '#475569',
        tickColor: '#94a3b8',
        gridColor: '#334155',
        highlightColor: 'rgba(56,189,248,0.15)',
        brushBg: 'rgba(255, 255, 255, 0.02)',
        brushStroke: '#475569',
        textStroke: '#0f172a',
        crosshair: '#64748b',
        hoverStroke: '#ffffff',
        brushFill: 'rgba(59,130,246,0.12)',
        brushHandle: '#94a3b8',
        fallback: '#999',
      }
    : {
        axisColor: '#cbd5e1',
        tickColor: '#64748b',
        gridColor: '#e2e8f0',
        highlightColor: 'rgba(56,189,248,0.12)',
        brushBg: 'rgba(0, 0, 0, 0.03)',
        brushStroke: '#cbd5e1',
        textStroke: '#ffffff',
        crosshair: '#94a3b8',
        hoverStroke: '#0f172a',
        brushFill: 'rgba(59,130,246,0.08)',
        brushHandle: '#64748b',
        fallback: '#999',
      };
};

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function pivotDailyData(rows: DailyRow[]) {
  const contributors = Array.from(new Set(rows.map((row) => row.contributor))).sort();
  const dateSet = new Set(rows.map((row) => row.date));
  const pivotMap = new Map<string, PivotedRow>();

  rows.forEach((row) => {
    const pivoted = pivotMap.get(row.date) ?? {
      date: new Date(`${row.date}T00:00:00Z`),
      dateKey: row.date,
    };
    pivoted[row.contributor] = row.commits;
    pivotMap.set(row.date, pivoted);
  });

  const data = Array.from(dateSet)
    .sort()
    .map((date) => {
      const base = pivotMap.get(date) ?? {
        date: new Date(`${date}T00:00:00Z`),
        dateKey: date,
      };
      contributors.forEach((contributor) => {
        base[contributor] = Number(base[contributor] ?? 0);
      });
      return base;
    });

  return { contributors, data };
}

export function ProjectRiverStreamgraph({
  colorMap,
  eventMarkers,
  highlightedContributor,
  onHoverContributor,
  onHoverEvent,
  onRangeChange,
  rows,
  t,
  visibleRange,
  svgRef: externalSvgRef,
}: ProjectRiverStreamgraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const localSvgRef = useRef<SVGSVGElement | null>(null);
  const svgRef = externalSvgRef || localSvgRef;
  const isDark = useIsDarkMode();
  const colors = useMemo(() => getChartColors(isDark), [isDark]);

  const [size, setSize] = useState({ width: 0, height: 0 });

  // Handle container resizing
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Format pivoted data and stacked series
  const { contributors, data: rawData } = useMemo(() => pivotDailyData(rows), [rows]);

  const series = useMemo(
    () => d3Stack<PivotedRow>()
      .keys(contributors)
      .order(stackOrderInsideOut)
      .offset(stackOffsetWiggle)(rawData),
    [contributors, rawData],
  );

  // Health spike dates detection
  const { dateTotals, spikeDates } = useMemo(() => {
    const totals = new Map<string, number>();
    rows.forEach((row) => {
      totals.set(row.date, (totals.get(row.date) ?? 0) + row.commits);
    });
    return {
      dateTotals: totals,
      spikeDates: Array.from(totals.entries())
        .filter(([, total]) => total > 0)
        .sort((left, right) => right[1] - left[1])
        .slice(0, MAX_SPIKE_MARKERS)
        .map(([date]) => date),
    };
  }, [rows]);

  // Group event markers by date
  const markersByDate = useMemo(() => {
    const markers = new Map<string, ProjectEventMarker[]>();
    eventMarkers.forEach((marker) => {
      if (marker.selected === false) return;
      const list = markers.get(marker.date) ?? [];
      list.push(marker);
      markers.set(marker.date, list);
    });
    return markers;
  }, [eventMarkers]);

  // Re-run D3 logic on data/size/mode changes
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || size.width === 0 || size.height === 0 || rawData.length === 0) return;

    const svg = select<SVGSVGElement, unknown>(svgEl);
    svg.selectAll('*').remove();

    svg.append('style').text(`
      .brush .overlay {
        fill: transparent !important;
      }
      .brush .selection {
        fill: #8b5cf6 !important;
        fill-opacity: 0.16 !important;
        stroke: #8b5cf6 !important;
        stroke-width: 2px !important;
        rx: 3px !important;
        filter: drop-shadow(0 0 3px rgba(139, 92, 246, 0.65)) !important;
      }
      .brush .handle {
        fill: #a78bfa !important;
        stroke: #8b5cf6 !important;
        stroke-width: 1.2px !important;
        width: 8px !important;
        rx: 3px !important;
        cursor: ew-resize !important;
        transition: fill 0.2s, stroke-width 0.2s;
      }
      .brush .handle:hover {
        fill: #c084fc !important;
        stroke: #a78bfa !important;
      }
    `);

    const dpr = window.devicePixelRatio || 1;
    const cssW = size.width;
    const cssH = size.height;

    // Apply DPR sharpening scaling
    svg
      .attr('width', cssW * dpr)
      .attr('height', cssH * dpr)
      .attr('viewBox', `0 0 ${cssW} ${cssH}`)
      .attr(
        'style',
        `max-width: 100%; width: ${cssW}px; height: ${cssH}px; display: block; user-select: none; -webkit-user-select: none;`,
      )
      .attr('shape-rendering', 'geometricPrecision');

    const chartWidth = cssW - MARGIN.left - MARGIN.right;
    const chartHeight = cssH - MARGIN.top - MARGIN.bottom - BRUSH_HEIGHT - BRUSH_GAP;

    const xDomain = extent(rawData, (d) => d.date) as [Date, Date];
    const fullDomainStart = xDomain[0] ?? new Date();
    const fullDomainEnd = xDomain[1] ?? new Date();

    const xBase: any = scaleUtc().domain([fullDomainStart, fullDomainEnd]).range([MARGIN.left, cssW - MARGIN.right]);
    const xScale: any = scaleUtc().domain([fullDomainStart, fullDomainEnd]).range([MARGIN.left, cssW - MARGIN.right]);

    const yMin = min(series, (layer) => min(layer, (d) => d[0])) ?? 0;
    const yMax = max(series, (layer) => max(layer, (d) => d[1])) ?? 0;
    const ySpan = yMax - yMin || 1;

    const yScale: any = scaleLinear()
      .domain([yMin - ySpan * 0.08, yMax + ySpan * 0.08])
      .range([MARGIN.top + chartHeight, MARGIN.top]);

    const brushYScale: any = scaleLinear()
      .domain([yMin - ySpan * 0.08, yMax + ySpan * 0.08])
      .range([BRUSH_HEIGHT - 6, 6]);

    const areaGenerator: any = d3Area<[number, number]>()
      .x((_, i) => xScale(rawData[i].date))
      .y0((d) => yScale(d[0]))
      .y1((d) => Math.min(yScale(d[1]), yScale(d[0]) - 2))
      .curve(curveBasis);

    const brushAreaGenerator: any = d3Area<[number, number]>()
      .x((_, i) => xBase(rawData[i].date))
      .y0((d) => brushYScale(d[0]))
      .y1((d) => Math.min(brushYScale(d[1]), brushYScale(d[0]) - 1))
      .curve(curveBasis);

    // SVG Defs
    const defs = svg.append('defs');
    defs
      .append('clipPath')
      .attr('id', 'clip-streamgraph')
      .append('rect')
      .attr('x', MARGIN.left)
      .attr('y', 0)
      .attr('width', chartWidth)
      .attr('height', MARGIN.top + chartHeight);

    defs
      .append('clipPath')
      .attr('id', 'reveal-streamgraph')
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', cssW)
      .attr('height', cssH);

    // Chart grid and elements
    const chartGroup = svg.append('g').attr('clip-path', 'url(#clip-streamgraph)');

    // Panning & zoom guide backgrounds
    chartGroup
      .append('rect')
      .attr('x', MARGIN.left)
      .attr('y', MARGIN.top)
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('fill', 'transparent');

    // Horizontal grid ticks
    const yTicks = yScale.ticks(5);
    chartGroup
      .selectAll('.grid-line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'grid-line')
      .attr('x1', MARGIN.left)
      .attr('x2', cssW - MARGIN.right)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', colors.gridColor)
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '4,6')
      .attr('opacity', 0.28);

    // Spike Indicators (vertical dotted lines)
    chartGroup
      .selectAll('.spike-indicator')
      .data(spikeDates)
      .enter()
      .append('line')
      .attr('class', 'spike-indicator')
      .attr('x1', (d) => xScale(new Date(`${d}T00:00:00Z`)))
      .attr('x2', (d) => xScale(new Date(`${d}T00:00:00Z`)))
      .attr('y1', MARGIN.top)
      .attr('y2', MARGIN.top + chartHeight)
      .attr('stroke', 'hsl(var(--primary))')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,5')
      .attr('opacity', 0.22);

    // Contributor Stream Layers (SVG paths)
    const layersGroup = chartGroup.append('g').attr('class', 'layers').attr('clip-path', 'url(#reveal-streamgraph)');

    const hoverHighlightEl = chartGroup
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', colors.hoverStroke)
      .attr('stroke-width', 2)
      .attr('opacity', 0)
      .style('pointer-events', 'none');

    // Crosshair Guide Lines
    const crosshairGroup = chartGroup.append('g').style('pointer-events', 'none');
    const crosshairH = crosshairGroup
      .append('line')
      .attr('stroke', colors.crosshair)
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '4,3')
      .style('display', 'none');
    const crosshairV = crosshairGroup
      .append('line')
      .attr('stroke', colors.crosshair)
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '4,3')
      .style('display', 'none');

    // Render grid dates label axis
    const gXAxis = svg.append('g').attr('transform', `translate(0,${MARGIN.top + chartHeight})`);

    const updateLayerVisibility = (activeName: string | null) => {
      layersGroup.selectAll('.river-path').attr('opacity', function (d: any) {
        if (!activeName) return 0.9;
        return d.key === activeName ? 0.95 : 0.16;
      });
      if (activeName) {
        const layer = series.find((s) => s.key === activeName);
        if (layer) {
          hoverHighlightEl.datum(layer).attr('d', areaGenerator).attr('opacity', 0.85);
        }
      } else {
        hoverHighlightEl.attr('opacity', 0);
      }
    };

    const handleHover = (event: PointerEvent, d: any) => {
      event.preventDefault();
      const contributor = d.key;
      const [px, py] = d3Pointer(event, svgRef.current);
      const date = xScale.invert(px);
      const isoDate = date.toISOString().split('T')[0];

      // Draw crosshairs
      crosshairH
        .style('display', 'block')
        .attr('x1', MARGIN.left)
        .attr('x2', cssW - MARGIN.right)
        .attr('y1', py)
        .attr('y2', py);
      crosshairV
        .style('display', 'block')
        .attr('x1', px)
        .attr('x2', px)
        .attr('y1', MARGIN.top)
        .attr('y2', MARGIN.top + chartHeight);

      updateLayerVisibility(contributor);

      // Search matching row values
      const matchingRow = rows.find((r) => r.contributor === contributor && r.date === isoDate);
      const totalDay = dateTotals.get(isoDate) || 0;
      const commitsVal = matchingRow?.commits || 0;

      onHoverContributor({
        contributor,
        date: isoDate,
        commits: commitsVal,
        totalCommits: totalDay,
        percentage: totalDay > 0 ? Math.round((commitsVal / totalDay) * 100) : 0,
        x: px,
        y: py,
      });
    };

    const handleLeave = () => {
      crosshairH.style('display', 'none');
      crosshairV.style('display', 'none');
      updateLayerVisibility(highlightedContributor);
      onHoverContributor(null);
    };

    layersGroup
      .selectAll('.river-path')
      .data(series)
      .enter()
      .append('path')
      .attr('class', 'river-path')
      .attr('d', areaGenerator)
      .attr('fill', (d) => colorMap.get(d.key) || colors.fallback)
      .attr('opacity', 0.9)
      .on('pointermove', handleHover)
      .on('pointerleave', handleLeave);

    // Initial highlight override from props
    updateLayerVisibility(highlightedContributor);

    // Key Node Markers (vertical clickable circles)
    const markersGroup = chartGroup.append('g');
    const markerLines = markersGroup.append('g');
    const markerCircles = markersGroup.append('g');

    const formattedMarkers = Array.from(markersByDate.entries()).map(([date, list]) => ({
      date,
      markers: list,
      marker: list[0],
    }));

    markerLines
      .selectAll('.marker-line')
      .data(formattedMarkers)
      .enter()
      .append('line')
      .attr('class', 'marker-line')
      .attr('x1', (d) => xScale(new Date(`${d.date}T00:00:00Z`)))
      .attr('x2', (d) => xScale(new Date(`${d.date}T00:00:00Z`)))
      .attr('y1', MARGIN.top)
      .attr('y2', MARGIN.top + chartHeight)
      .attr('stroke', 'hsl(var(--primary))')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '2,5')
      .attr('opacity', 0.42);

    const severityColors = (severity: string) => {
      if (severity === 'positive') return 'var(--github-success)';
      if (severity === 'warning') return 'var(--github-warning)';
      return 'var(--github-info)';
    };

    markerCircles
      .selectAll('.marker-circle')
      .data(formattedMarkers)
      .enter()
      .append('circle')
      .attr('class', 'marker-circle cursor-pointer')
      .attr('cx', (d) => xScale(new Date(`${d.date}T00:00:00Z`)))
      .attr('cy', (_, i) => MARGIN.top + 8 + (i % 3) * 15)
      .attr('r', 3.5)
      .attr('fill', (d) => severityColors(d.marker.severity))
      .attr('stroke', 'hsl(var(--background))')
      .attr('stroke-width', 2)
      .on('pointerenter', function (event, d) {
        select(this).attr('r', 5.5);
        onHoverEvent(d.marker, { x: event.clientX, y: event.clientY });
      })
      .on('pointerleave', function () {
        select(this).attr('r', 3.5);
        onHoverEvent(null, null);
      });

    // Inline Contributor text Labels
    const labelsGroup = chartGroup.append('g').style('pointer-events', 'none');
    const contributorLabelData = series
      .map((layer) => {
        let maxThickness = 0;
        let bestIndex = 0;
        layer.forEach((pt, index) => {
          const thickness = Math.abs(yScale(pt[1]) - yScale(pt[0]));
          if (thickness > maxThickness) {
            maxThickness = thickness;
            bestIndex = index;
          }
        });
        const originalX = xScale(rawData[bestIndex].date);
        const clampedX = Math.max(MARGIN.left + 40, Math.min(cssW - MARGIN.right - 40, originalX));
        return {
          contributor: layer.key,
          maxThickness,
          date: rawData[bestIndex].date,
          x: clampedX,
          y: (yScale(layer[bestIndex][0]) + yScale(layer[bestIndex][1])) / 2,
        };
      })
      .filter((d) => d.maxThickness >= 12)
      .sort((a, b) => b.maxThickness - a.maxThickness)
      .slice(0, MAX_CONTRIBUTOR_LABELS);

    labelsGroup
      .selectAll('.river-label')
      .data(contributorLabelData)
      .enter()
      .append('text')
      .attr('class', 'river-label')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y + 4)
      .attr('fill', 'hsl(var(--foreground))')
      .style('paint-order', 'stroke')
      .style('stroke', 'hsl(var(--background))')
      .style('stroke-width', '2.5px')
      .style('stroke-linejoin', 'round')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('text-anchor', 'middle')
      .attr('opacity', 0.85)
      .text((d) => (d.contributor === 'Other contributors' ? t('projectRiver.otherContributors') : d.contributor));

    // Bottom Brush Section
    const brushGroup = svg.append('g').attr('transform', `translate(0, ${cssH - BRUSH_HEIGHT})`);

    // Brush background track
    brushGroup
      .append('rect')
      .attr('x', MARGIN.left)
      .attr('width', chartWidth)
      .attr('height', BRUSH_HEIGHT)
      .attr('fill', colors.brushBg)
      .attr('rx', 4);

    // Separator line
    brushGroup
      .append('line')
      .attr('x1', MARGIN.left)
      .attr('x2', cssW - MARGIN.right)
      .attr('y1', -BRUSH_GAP / 2)
      .attr('y2', -BRUSH_GAP / 2)
      .attr('stroke', colors.gridColor)
      .attr('stroke-width', 1);

    // Brush Mini path layers
    const brushLayersGroup = brushGroup.append('g');
    brushLayersGroup
      .selectAll('.brush-river-path')
      .data(series)
      .enter()
      .append('path')
      .attr('class', 'brush-river-path')
      .attr('d', brushAreaGenerator)
      .attr('fill', (_, i) => {
        const sat = 55 + (i % 3) * 10;
        const light = 45 + (i % 4) * 8;
        return `hsl(262, ${sat}%, ${light}%)`;
      })
      .attr('opacity', 0.35);

    // Syncing zoom callback handles
    let isProgrammatic = false;

    const smartTimeFormat = (date: Date): string => {
      const domain = xScale.domain();
      const span = (domain[1] as any) - (domain[0] as any);
      const oneYear = 365.25 * 86400000;
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      if (span > 5 * oneYear) return date.getMonth() === 0 ? `${date.getFullYear()}` : '';
      if (span > oneYear) return date.getMonth() === 0 ? `${date.getFullYear()}` : monthNames[date.getMonth()];
      if (span > 90 * 86400000) return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
      return `${monthNames[date.getMonth()]} ${date.getDate()}`;
    };

    const updateXAxis = () => {
      gXAxis.call(
        axisBottom(xScale)
          .ticks(Math.max(2, Math.floor(chartWidth / 80)))
          .tickFormat(smartTimeFormat as any),
      );
      gXAxis.select('.domain').attr('stroke', colors.axisColor);
      gXAxis.selectAll('.tick line').attr('stroke', colors.axisColor);
      gXAxis
        .selectAll('.tick text')
        .attr('fill', colors.tickColor)
        .attr('font-size', '10px')
        .style('paint-order', 'stroke')
        .style('stroke', colors.textStroke)
        .style('stroke-width', '3px')
        .style('stroke-linejoin', 'round');
    };

    updateXAxis();

    const redrawChartForCurrentDomain = () => {
      updateXAxis();

      layersGroup.selectAll('.river-path').attr('d', areaGenerator);
      if (highlightedContributor) {
        const layer = series.find((s) => s.key === highlightedContributor);
        if (layer) hoverHighlightEl.datum(layer).attr('d', areaGenerator);
      }

      chartGroup
        .selectAll('.spike-indicator')
        .attr('x1', (d: any) => xScale(new Date(`${d}T00:00:00Z`)))
        .attr('x2', (d: any) => xScale(new Date(`${d}T00:00:00Z`)));

      markerLines
        .selectAll('.marker-line')
        .attr('x1', (d: any) => xScale(new Date(`${d.date}T00:00:00Z`)))
        .attr('x2', (d: any) => xScale(new Date(`${d.date}T00:00:00Z`)));

      markerCircles.selectAll('.marker-circle').attr('cx', (d: any) => xScale(new Date(`${d.date}T00:00:00Z`)));

      labelsGroup
        .selectAll('.river-label')
        .attr('x', (d: any) => {
          const originalX = xScale(d.date);
          return Math.max(MARGIN.left + 40, Math.min(cssW - MARGIN.right - 40, originalX));
        });
    };

    let rangeRafId: number | null = null;
    const emitVisibleRange = () => {
      if (rangeRafId) {
        cancelAnimationFrame(rangeRafId);
      }
      rangeRafId = requestAnimationFrame(() => {
        rangeRafId = null;
        if (!xScale) return;
        const [d0, d1] = xScale.domain();
        onRangeChange({
          start: d0.toISOString().split('T')[0],
          end: d1.toISOString().split('T')[0],
        });
      });
    };

    // Zoom setup
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 50])
      .extent([
        [MARGIN.left, 0],
        [cssW - MARGIN.right, MARGIN.top + chartHeight],
      ])
      .translateExtent([
        [MARGIN.left, -Infinity],
        [cssW - MARGIN.right, Infinity],
      ])
      .on('zoom', (event) => {
        const k = event.transform.k;
        const [rMin, rMax] = xBase.range();
        const clampedX = Math.max(rMax * (1 - k), Math.min(rMin * (1 - k), event.transform.x));
        const t = k === 1 && event.transform.x === 0 ? event.transform : zoomIdentity.translate(clampedX, 0).scale(k);

        // Sync D3 internal zoom transforms
        const node = svgRef.current as any;
        if (node) node.__zoom = t;

        const newDomain = t.rescaleX(xBase);
        xScale.domain(newDomain.domain());

        redrawChartForCurrentDomain();

        // Sync brush slider handle:
        // ONLY if the zoom was NOT triggered by the brush (e.g. sourceEvent type is not 'brush' or 'end'),
        // and we are not in programmatic mode!
        const isFromBrush = event.sourceEvent?.type === 'brush' || event.sourceEvent?.type === 'end';
        if (!isFromBrush && brushGroupSelection && brushBehavior && !isProgrammatic) {
          isProgrammatic = true;
          const sel =
            rMax > rMin
              ? [Math.max(rMin, t.invertX(rMin)), Math.min(rMax, t.invertX(rMax))]
              : [rMin, rMax];
          brushGroupSelection.call(brushBehavior.move, sel);
          isProgrammatic = false;
        }

        emitVisibleRange();
      });

    // Add zoom listeners
    svg.call(zoomBehavior);

    // Disable default wheel zooms (overridden for panning trackpad support)
    svg.on('wheel.zoom', null);

    // Ensure tooltip hides when mouse leaves the SVG boundary entirely
    svg.on('pointerleave', handleLeave);

    // Custom scroll zooms
    const handleCustomWheel = (event: WheelEvent) => {
      const isZoom = event.ctrlKey || event.metaKey;

      if (isZoom) {
        event.preventDefault();
        const t = (svgRef.current as any).__zoom || zoomIdentity;
        const factor = event.deltaY > 0 ? 1.08 : 0.92;
        const newK = Math.max(1, Math.min(50, t.k * factor));

        const rect = containerRef.current!.getBoundingClientRect();
        const cx = event.clientX - rect.left;
        const newT = zoomIdentity.translate(t.x + cx * (1 - newK / t.k), 0).scale(newK);

        svg.call(zoomBehavior.transform, newT);
      }
    };

    const element = containerRef.current;
    element?.addEventListener('wheel', handleCustomWheel, { passive: false });

    // Safari Multitouch Trackpad Gestures
    let gestureStartScale = 1;
    const handleGestureStart = (e: any) => {
      gestureStartScale = e.scale;
    };

    const handleGestureChange = (e: any) => {
      e.preventDefault();
      if (Math.abs(e.scale - gestureStartScale) < 0.02) return;

      const t = (svgRef.current as any).__zoom || zoomIdentity;
      const rawRatio = gestureStartScale / e.scale;
      const dampenedRatio = 1 + (rawRatio - 1) * 0.35;
      const newK = Math.max(1, Math.min(50, t.k * dampenedRatio));
      gestureStartScale = e.scale;

      const rect = containerRef.current!.getBoundingClientRect();
      const cx = rect.width / 2;
      const newT = zoomIdentity.translate(t.x + cx * (1 - newK / t.k), 0).scale(newK);

      svg.call(zoomBehavior.transform, newT);
    };

    element?.addEventListener('gesturestart', handleGestureStart);
    element?.addEventListener('gesturechange', handleGestureChange);

    // Brush slider config
    let styleBrushControls = () => {};
    const brushBehavior = d3BrushX()
      .handleSize(18)
      .extent([
        [MARGIN.left, 0.5],
        [cssW - MARGIN.right, BRUSH_HEIGHT - 0.5],
      ])
      .on('brush end', (event) => {
        styleBrushControls();
        if (!event.selection || event.sourceEvent?.type === 'zoom' || isProgrammatic) return;

        const [x0, x1] = event.selection.map(xBase.invert, xBase);
        const domain = xBase.domain() as Date[];
        const domainSpan = domain[1].getTime() - domain[0].getTime();
        const selectionSpan = x1.getTime() - x0.getTime();

        if (selectionSpan <= 0 || !Number.isFinite(selectionSpan)) return;

        const k = Math.min(50, Math.max(1, domainSpan / selectionSpan));
        const tx = -xBase(x0) * k + MARGIN.left;
        if (!Number.isFinite(k) || !Number.isFinite(tx)) return;

        const nextTransform = zoomIdentity.translate(tx, 0).scale(k);
        const node = svgRef.current as any;
        if (node) node.__zoom = nextTransform;

        xScale.domain([x0, x1]);
        redrawChartForCurrentDomain();

        emitVisibleRange();
      });

    const brushGroupSelection: any = brushGroup.append('g').attr('class', 'brush').call(brushBehavior);

    styleBrushControls = () => {
      brushGroupSelection
        .selectAll('.selection')
        .attr('height', BRUSH_HEIGHT - 8)
        .attr('y', 4);
      brushGroupSelection
        .selectAll('.handle')
        .attr('width', 16)
        .attr('y', 0)
        .attr('height', BRUSH_HEIGHT)
        .attr('rx', 8);
    };

    styleBrushControls();

    const initialBrushSelection = (() => {
      if (!visibleRange) {
        return xBase.range();
      }

      const startX = xBase(new Date(`${visibleRange.start}T00:00:00Z`));
      const endX = xBase(new Date(`${visibleRange.end}T00:00:00Z`));
      if (!Number.isFinite(startX) || !Number.isFinite(endX)) {
        return xBase.range();
      }

      const clamped = [startX, endX]
        .map((value) => Math.max(MARGIN.left, Math.min(cssW - MARGIN.right, value)))
        .sort((left, right) => left - right);
      return clamped[0] === clamped[1] ? xBase.range() : clamped;
    })();

    brushGroupSelection.call(brushBehavior.move, initialBrushSelection);
    styleBrushControls();

    // Cleanup listeners
    return () => {
      if (rangeRafId) {
        cancelAnimationFrame(rangeRafId);
      }
      element?.removeEventListener('wheel', handleCustomWheel);
      element?.removeEventListener('gesturestart', handleGestureStart);
      element?.removeEventListener('gesturechange', handleGestureChange);
    };
  }, [
    colorMap,
    colors,
    dateTotals,
    highlightedContributor,
    markersByDate,
    onHoverContributor,
    onHoverEvent,
    onRangeChange,
    rawData,
    rows,
    series,
    size,
    spikeDates,
    svgRef,
    t,
    visibleRange,
  ]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-0 relative overflow-hidden bg-background/25">
      <svg ref={svgRef} className="w-full h-full block" />
    </div>
  );
}
