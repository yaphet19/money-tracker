import { emptyState, isValidBackup } from './logic.js';

const KEY = 'money-tracker-v1';

export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return emptyState();
  try { const s = JSON.parse(raw); if (isValidBackup(s)) return s; } catch {}
  localStorage.setItem(`${KEY}-broken-${Date.now()}`, raw); // never silently drop data we can't read
  alert('Saved data could not be read. It was kept aside. Restore a backup in Settings.');
  return emptyState();
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { alert(`Could not save: ${e.message}. Make a backup now.`); }
}

// iPhone: opens the share sheet (Save to Files / Telegram). Elsewhere: downloads the file.
// Returns false when the user cancels the share sheet.
export async function exportBackup(state, dateStr) {
  const file = new File([JSON.stringify(state)], `money-backup-${dateStr}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); }
    catch (e) { if (e.name === 'AbortError') return false; throw e; }
    return true;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

export async function readBackup(file) {
  let s;
  try { s = JSON.parse(await file.text()); } catch { s = null; }
  if (!isValidBackup(s)) throw new Error('This is not a Money Tracker backup file.');
  return s;
}
