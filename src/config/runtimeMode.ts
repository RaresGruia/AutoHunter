export type RuntimeMode = 'LIVE' | 'DEMO';
export function runtimeMode(value = process.env.AUTOHUNTER_MODE): RuntimeMode {
  if (value === undefined || value.toLowerCase() === 'live') return 'LIVE';
  if (value.toLowerCase() === 'demo') return 'DEMO';
  throw new Error('AUTOHUNTER_MODE must be live or demo.');
}
