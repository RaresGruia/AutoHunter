export const CURRENT_SEARCH_KEY = 'autohunter:currentSearchId:v1';
export interface JobStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export async function loadCurrentSearchId(storage: JobStorage): Promise<string | null> {
  const id = await storage.getItem(CURRENT_SEARCH_KEY);
  return id && /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? id : null;
}
export async function saveCurrentSearchId(storage: JobStorage, id: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid search ID');
  await storage.setItem(CURRENT_SEARCH_KEY, id);
}
export async function clearCurrentSearchId(storage: JobStorage): Promise<void> { await storage.removeItem(CURRENT_SEARCH_KEY); }
