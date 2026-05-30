import { useState } from 'react';
import { max } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { arc, curveLinearClosed, lineRadial } from 'd3-shape';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type RadarAxisKey =
  | 'commits'
  | 'prs'
  | 'issues'
  | 'releases'
  | 'engagement'
  | 'activeDays';

export interface RadarAxisDatum {
  key: RadarAxisKey;
  label: string;
  rawValue: number;
  normalizedValue: number;
}

export interface ContributorRadarDatum {
  contributor: string;
  axes: RadarAxisDatum[];
  totalEvents: number;
  activeDays: number;
}

export interface HourlyRadarDatum {
  hour: number;
  label: string;
  count: number;
  normalizedValue: number;
}

interface ContributorCapabilityRadarProps {
  activeDaysLabel: string;
  contributorSelectLabel: string;
  data: ContributorRadarDatum[];
  emptyMessage: string;
  normalizedLabel: string;
  onContributorChange: (contributor: string) => void;
  rawValueLabel: string;
  selectedContributor: string;
  totalEventsLabel: string;
}

interface HourlyActivityRadialChartProps {
  countLabel: string;
  data: HourlyRadarDatum[];
  emptyMessage: string;
  normalizedLabel: string;
  peakHourLabel: string;
  totalCommitsLabel: string;
}

interface HourlyArcDatum extends HourlyRadarDatum {
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
}

const CHART_SIZE = 320;
const CENTER = CHART_SIZE / 2;
const RADAR_RADIUS = 108;
const HOURLY_INNER_RADIUS = 54;
const HOURLY_OUTER_RADIUS = 124;
const FULL_CIRCLE = Math.PI * 2;
const EMPTY_RADAR_AXES: RadarAxisDatum[] = [];
const RADAR_RINGS = [25, 50, 75, 100];

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function polarPoint(angle: number, radius: number) {
  return {
    x: CENTER + Math.sin(angle) * radius,
    y: CENTER - Math.cos(angle) * radius,
  };
}

function formatPercent(value: number) {
  return `${Math.round(clampPercent(value))}%`;
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-[19rem] items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function getTextAnchor(x: number) {
  if (x > CENTER + 8) {
    return 'start';
  }
  if (x < CENTER - 8) {
    return 'end';
  }
  return 'middle';
}

function getHourFill(hour: number) {
  if (hour < 6) {
    return 'hsl(var(--muted-foreground))';
  }
  if (hour < 12) {
    return 'var(--github-info)';
  }
  if (hour < 18) {
    return 'hsl(var(--primary))';
  }
  return 'var(--github-warning)';
}

export function ContributorCapabilityRadar({
  activeDaysLabel,
  contributorSelectLabel,
  data,
  emptyMessage,
  normalizedLabel,
  onContributorChange,
  rawValueLabel,
  selectedContributor,
  totalEventsLabel,
}: ContributorCapabilityRadarProps) {
  const [hoveredAxisKey, setHoveredAxisKey] = useState<RadarAxisKey | null>(null);
  const selectedDatum = data.find((datum) => datum.contributor === selectedContributor) ?? data[0];
  const axes = selectedDatum?.axes ?? EMPTY_RADAR_AXES;
  const hoveredAxis = axes.find((axis) => axis.key === hoveredAxisKey) ?? null;

  const radiusScale = scaleLinear().domain([0, 100]).range([0, RADAR_RADIUS]);
  const pathBuilder = lineRadial<RadarAxisDatum>()
    .angle((_, index) => (index / axes.length) * FULL_CIRCLE)
    .radius((axis) => radiusScale(clampPercent(axis.normalizedValue)))
    .curve(curveLinearClosed);
  const radarPath = axes.length > 0 ? pathBuilder(axes) ?? '' : '';

  if (!selectedDatum) {
    return <EmptyChartState message={emptyMessage} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <MetricPill label={totalEventsLabel} value={selectedDatum.totalEvents} />
          <MetricPill label={activeDaysLabel} value={selectedDatum.activeDays} />
        </div>
        <Select value={selectedDatum.contributor} onValueChange={onContributorChange}>
          <SelectTrigger
            aria-label={contributorSelectLabel}
            className="h-9 w-full border-border bg-card/60 text-xs text-foreground sm:w-56"
          >
            <SelectValue placeholder={contributorSelectLabel} />
          </SelectTrigger>
          <SelectContent>
            {data.map((datum) => (
              <SelectItem key={datum.contributor} value={datum.contributor}>
                {datum.contributor}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative h-[19rem]">
        <svg
          className="h-full w-full overflow-visible"
          role="img"
          viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
        >
          <g>
            {RADAR_RINGS.map((ring) => {
              const points = axes
                .map((_, index) => {
                  const point = polarPoint((index / axes.length) * FULL_CIRCLE, radiusScale(ring));
                  return `${point.x},${point.y}`;
                })
                .join(' ');

              return (
                <polygon
                  key={ring}
                  fill="none"
                  points={points}
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                />
              );
            })}

            {axes.map((axis, index) => {
              const angle = (index / axes.length) * FULL_CIRCLE;
              const outerPoint = polarPoint(angle, RADAR_RADIUS);
              const labelPoint = polarPoint(angle, RADAR_RADIUS + 24);

              return (
                <g key={axis.key}>
                  <line
                    stroke="hsl(var(--border))"
                    strokeOpacity={0.5}
                    strokeWidth={1}
                    x1={CENTER}
                    x2={outerPoint.x}
                    y1={CENTER}
                    y2={outerPoint.y}
                  />
                  <text
                    fill="hsl(var(--muted-foreground))"
                    fontSize={10}
                    fontWeight={500}
                    textAnchor={getTextAnchor(labelPoint.x)}
                    x={labelPoint.x}
                    y={labelPoint.y}
                  >
                    {axis.label}
                  </text>
                </g>
              );
            })}
          </g>

          <g transform={`translate(${CENTER} ${CENTER})`}>
            <path
              d={radarPath}
              fill="hsl(var(--primary))"
              fillOpacity={0.18}
              stroke="hsl(var(--primary))"
              strokeLinejoin="round"
              strokeWidth={2}
            />
            {axes.map((axis, index) => {
              const angle = (index / axes.length) * FULL_CIRCLE;
              const radius = radiusScale(clampPercent(axis.normalizedValue));
              const x = Math.sin(angle) * radius;
              const y = -Math.cos(angle) * radius;

              return (
                <circle
                  key={axis.key}
                  aria-label={`${axis.label}: ${axis.rawValue}`}
                  className="cursor-pointer transition-opacity"
                  cx={x}
                  cy={y}
                  fill="hsl(var(--primary))"
                  onBlur={() => setHoveredAxisKey(null)}
                  onFocus={() => setHoveredAxisKey(axis.key)}
                  onMouseEnter={() => setHoveredAxisKey(axis.key)}
                  onMouseLeave={() => setHoveredAxisKey(null)}
                  r={5}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  tabIndex={0}
                />
              );
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl border border-border bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
          {hoveredAxis ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{hoveredAxis.label}</span>
              <span className="text-muted-foreground">
                {rawValueLabel}: {hoveredAxis.rawValue} · {normalizedLabel}:{' '}
                {formatPercent(hoveredAxis.normalizedValue)}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{selectedDatum.contributor}</span>
              <span className="text-muted-foreground">
                {totalEventsLabel}: {selectedDatum.totalEvents}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HourlyActivityRadialChart({
  countLabel,
  data,
  emptyMessage,
  normalizedLabel,
  peakHourLabel,
  totalCommitsLabel,
}: HourlyActivityRadialChartProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const totalCommits = data.reduce((sum, datum) => sum + datum.count, 0);
  const maxCount = max(data, (datum) => datum.count) ?? 0;
  const peakDatum = data.reduce<HourlyRadarDatum | null>((peak, datum) => {
    if (!peak || datum.count > peak.count) {
      return datum;
    }
    return peak;
  }, null);
  const hoveredDatum = data.find((datum) => datum.hour === hoveredHour) ?? null;

  const radiusScale = scaleLinear()
    .domain([0, Math.max(maxCount, 1)])
    .range([HOURLY_INNER_RADIUS + 6, HOURLY_OUTER_RADIUS]);
  const barArc = arc<HourlyArcDatum>()
    .innerRadius((datum) => datum.innerRadius)
    .outerRadius((datum) => datum.outerRadius)
    .startAngle((datum) => datum.startAngle)
    .endAngle((datum) => datum.endAngle)
    .cornerRadius(3);
  const angleStep = FULL_CIRCLE / 24;
  const gap = angleStep * 0.16;
  const arcs = data.map((datum) => ({
    ...datum,
    startAngle: datum.hour * angleStep + gap / 2,
    endAngle: (datum.hour + 1) * angleStep - gap / 2,
    innerRadius: HOURLY_INNER_RADIUS,
    outerRadius: radiusScale(datum.count),
  }));

  if (totalCommits === 0) {
    return <EmptyChartState message={emptyMessage} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <MetricPill label={totalCommitsLabel} value={totalCommits} />
        <MetricPill label={peakHourLabel} value={peakDatum?.label ?? '-'} />
      </div>

      <div className="relative h-[19rem]">
        <svg
          className="h-full w-full overflow-visible"
          role="img"
          viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
        >
          <g transform={`translate(${CENTER} ${CENTER})`}>
            {[HOURLY_INNER_RADIUS, 86, HOURLY_OUTER_RADIUS].map((radius) => (
              <circle
                key={radius}
                fill="none"
                r={radius}
                stroke="hsl(var(--border))"
                strokeOpacity={0.55}
                strokeWidth={1}
              />
            ))}

            {arcs.map((datum) => {
              const path = barArc(datum) ?? undefined;
              const intensity = datum.normalizedValue / 100;
              const isHovered = hoveredHour === datum.hour;

              return (
                <path
                  key={datum.hour}
                  aria-label={`${datum.label}: ${datum.count}`}
                  className="cursor-pointer transition-opacity"
                  d={path}
                  fill={getHourFill(datum.hour)}
                  fillOpacity={isHovered ? 0.95 : 0.35 + intensity * 0.45}
                  onBlur={() => setHoveredHour(null)}
                  onFocus={() => setHoveredHour(datum.hour)}
                  onMouseEnter={() => setHoveredHour(datum.hour)}
                  onMouseLeave={() => setHoveredHour(null)}
                  stroke="hsl(var(--background))"
                  strokeWidth={1}
                  tabIndex={0}
                />
              );
            })}

            {[0, 6, 12, 18].map((hour) => {
              const angle = (hour / 24) * FULL_CIRCLE;
              const point = {
                x: Math.sin(angle) * (HOURLY_OUTER_RADIUS + 22),
                y: -Math.cos(angle) * (HOURLY_OUTER_RADIUS + 22),
              };

              return (
                <text
                  key={hour}
                  fill="hsl(var(--muted-foreground))"
                  fontSize={10}
                  fontWeight={500}
                  textAnchor="middle"
                  x={point.x}
                  y={point.y}
                >
                  {String(hour).padStart(2, '0')}:00
                </text>
              );
            })}

            <circle
              fill="hsl(var(--card))"
              r={42}
              stroke="hsl(var(--border))"
              strokeOpacity={0.9}
              strokeWidth={1}
            />
            <text
              fill="hsl(var(--muted-foreground))"
              fontSize={10}
              fontWeight={500}
              textAnchor="middle"
              y={-12}
            >
              {totalCommitsLabel}
            </text>
            <text
              fill="hsl(var(--foreground))"
              fontSize={24}
              fontWeight={700}
              textAnchor="middle"
              y={12}
            >
              {totalCommits}
            </text>
          </g>
        </svg>

        <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl border border-border bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
          {hoveredDatum ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{hoveredDatum.label}</span>
              <span className="text-muted-foreground">
                {countLabel}: {hoveredDatum.count} · {normalizedLabel}:{' '}
                {formatPercent(hoveredDatum.normalizedValue)}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{peakHourLabel}</span>
              <span className="text-muted-foreground">
                {peakDatum?.label ?? '-'} · {countLabel}: {peakDatum?.count ?? 0}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
