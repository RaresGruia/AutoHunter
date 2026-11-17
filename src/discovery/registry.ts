import type { DiscoverySourceAdapter, SourceDescriptor } from './SourceAdapter.js';

export class SourceRegistry {
  private readonly sources = new Map<string, { descriptor: SourceDescriptor; adapter?: DiscoverySourceAdapter }>();
  register(descriptor: SourceDescriptor, adapter?: DiscoverySourceAdapter): void {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(descriptor.id) || this.sources.has(descriptor.id)) throw new Error('Invalid or duplicate source ID');
    if (adapter && adapter.descriptor.id !== descriptor.id) throw new Error('Source adapter ID mismatch');
    this.sources.set(descriptor.id, {descriptor:structuredClone(descriptor), ...(adapter ? {adapter} : {})});
  }
  list(): SourceDescriptor[] { return [...this.sources.values()].map(entry=>structuredClone(entry.descriptor)); }
  entries() { return [...this.sources.values()]; }
}

export function sourceBlockReason(source: SourceDescriptor, allowExternal: boolean): string | null {
  if (!['AVAILABLE','DEMO'].includes(source.status)) return source.status;
  if (!source.configured) return 'NOT_CONFIGURED';
  if (source.kind !== 'DEMO' && (!source.permission.dataUse || !source.permission.reference?.trim())) return 'DATA_PERMISSION_REQUIRED';
  if (source.transport === 'NETWORK' && !allowExternal) return 'NETWORK_DISABLED';
  return null;
}
