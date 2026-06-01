import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();

  readonly wsConnections: Gauge<'nodeId'>;
  readonly wsSubscriptions: Gauge<'nodeId'>;
  readonly emitLatency: Histogram<'event_name'>;
  readonly emitTotal: Counter<'event_name'>;

  private readonly nodeId: string;

  constructor() {
    this.nodeId = process.env.NODE_ID ?? process.env.APP_PORT ?? 'default';

    this.wsConnections = new Gauge({
      name: 'repo_pulse_ws_connections',
      help: 'Current count of authenticated WebSocket clients per node',
      labelNames: ['nodeId'],
      registers: [this.registry],
    });

    this.wsSubscriptions = new Gauge({
      name: 'repo_pulse_ws_subscriptions',
      help: 'Current total of active room subscriptions across clients per node',
      labelNames: ['nodeId'],
      registers: [this.registry],
    });

    this.emitLatency = new Histogram({
      name: 'repo_pulse_emit_latency_ms',
      help: 'WebSocket broadcast end-to-end latency (ms) per event name',
      labelNames: ['event_name'],
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });

    this.emitTotal = new Counter({
      name: 'repo_pulse_emit_total',
      help: 'Total WebSocket broadcasts emitted per event name',
      labelNames: ['event_name'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'repo_pulse_node_',
    });
  }

  incrementConnections(): void {
    this.wsConnections.labels(this.nodeId).inc();
  }

  decrementConnections(): void {
    this.wsConnections.labels(this.nodeId).dec();
  }

  incrementSubscriptions(): void {
    this.wsSubscriptions.labels(this.nodeId).inc();
  }

  decrementSubscriptions(delta = 1): void {
    this.wsSubscriptions.labels(this.nodeId).dec(delta);
  }

  observeEmitLatency(eventName: string, latencyMs: number): void {
    this.emitTotal.labels(eventName).inc();
    if (latencyMs >= 0) {
      this.emitLatency.labels(eventName).observe(latencyMs);
    }
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
