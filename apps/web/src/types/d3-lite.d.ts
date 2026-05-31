declare module 'd3-array' {
  export function extent<T>(
    values: Iterable<T>,
    accessor: (datum: T, index: number, values: Iterable<T>) => Date,
  ): [Date | undefined, Date | undefined];
  export function extent<T>(
    values: Iterable<T>,
    accessor: (datum: T, index: number, values: Iterable<T>) => number,
  ): [number | undefined, number | undefined];

  export function max<T>(
    values: Iterable<T>,
    accessor: (datum: T, index: number, values: Iterable<T>) => number | undefined,
  ): number | undefined;
  export function max<T>(
    values: Iterable<T>,
    accessor: (datum: T, index: number, values: Iterable<T>) => string,
  ): string | undefined;

  export function min<T>(
    values: Iterable<T>,
    accessor: (datum: T, index: number, values: Iterable<T>) => number | undefined,
  ): number | undefined;
  export function min<T>(
    values: Iterable<T>,
    accessor: (datum: T, index: number, values: Iterable<T>) => string,
  ): string | undefined;
}

declare module 'd3-scale' {
  interface ContinuousScale<Domain> {
    (value: Domain): number;
    domain(value: Domain[]): this;
    invert(value: number): Domain;
    range(value: number[]): this;
    ticks(count?: number): number[];
  }

  export function scaleLinear(): ContinuousScale<number>;
  export function scaleUtc(): ContinuousScale<Date>;
}

declare module 'd3-shape' {
  export const curveBasis: unknown;
  export const curveLinearClosed: unknown;
  export const stackOffsetWiggle: unknown;
  export const stackOrderInsideOut: unknown;

  export interface AreaGenerator<Datum> {
    (data: Iterable<Datum>): string | null;
    curve(curve: unknown): this;
    x(accessor: (datum: Datum, index: number, data: Iterable<Datum>) => number): this;
    y0(accessor: (datum: Datum, index: number, data: Iterable<Datum>) => number): this;
    y1(accessor: (datum: Datum, index: number, data: Iterable<Datum>) => number): this;
  }

  export interface ArcGenerator<Datum> {
    (datum: Datum): string | null;
    cornerRadius(value: number): this;
    endAngle(accessor: (datum: Datum) => number): this;
    innerRadius(accessor: (datum: Datum) => number): this;
    outerRadius(accessor: (datum: Datum) => number): this;
    startAngle(accessor: (datum: Datum) => number): this;
  }

  export interface LineRadialGenerator<Datum> {
    (data: Iterable<Datum>): string | null;
    angle(accessor: (datum: Datum, index: number, data: Iterable<Datum>) => number): this;
    curve(curve: unknown): this;
    radius(accessor: (datum: Datum, index: number, data: Iterable<Datum>) => number): this;
  }

  export type SeriesPoint<Datum> = [number, number] & { data: Datum };
  export type Series<Datum> = SeriesPoint<Datum>[] & { key: string };

  export interface StackGenerator<Datum> {
    (data: Datum[]): Array<Series<Datum>>;
    keys(keys: string[]): this;
    offset(offset: unknown): this;
    order(order: unknown): this;
  }

  export function area<Datum>(): AreaGenerator<Datum>;
  export function arc<Datum>(): ArcGenerator<Datum>;
  export function lineRadial<Datum>(): LineRadialGenerator<Datum>;
  export function stack<Datum>(): StackGenerator<Datum>;
}
