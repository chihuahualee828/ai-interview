const MIN_HEIGHT = 160, MAX_HEIGHT = 1200, DEFAULT_HEIGHT = 300;
const clamp = (height: number) => Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height)));

/** Device-local layout preference only. Never store note text or session tokens here. */
export function setupNoteHeight(content: HTMLElement, handle: HTMLElement) {
 let key: string | null = null;
 let drag: {id: number; y: number; height: number} | undefined;
 function setHeight(height: number) {
  const value = clamp(height);
  content.style.height = `${value}px`;
  handle.setAttribute('aria-valuenow', String(value));
 }
 function persist() {
  if (!key) return;
  try { localStorage.setItem(key, String(clamp(content.getBoundingClientRect().height))); } catch { /* Optional preference. */ }
 }
 function endDrag(cancel = false) {
  if (!drag) return;
  const previous = drag; drag = undefined;
  if (cancel) setHeight(previous.height); else persist();
  if (handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
 }
 handle.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return;
  event.preventDefault(); handle.focus({preventScroll: true});
  drag = {id: event.pointerId, y: event.clientY, height: content.getBoundingClientRect().height};
  handle.setPointerCapture(event.pointerId);
 });
 handle.addEventListener('pointermove', event => {
  if (drag?.id === event.pointerId) setHeight(drag.height + event.clientY - drag.y);
 });
 handle.addEventListener('pointerup', () => endDrag());
 handle.addEventListener('pointercancel', () => endDrag(true));
 handle.addEventListener('lostpointercapture', () => endDrag(true));
 handle.addEventListener('keydown', event => {
  const height = content.getBoundingClientRect().height;
  const next = event.key === 'ArrowUp' ? height - 40 : event.key === 'ArrowDown' ? height + 40
   : event.key === 'Home' ? MIN_HEIGHT : event.key === 'End' ? MAX_HEIGHT : undefined;
  if (next === undefined) return;
  event.preventDefault(); event.stopPropagation(); setHeight(next); persist();
 });
 return {
  restore(nextKey: string | null) {
   endDrag(true); key = nextKey;
   let height = DEFAULT_HEIGHT;
   try {
    const stored = key ? localStorage.getItem(key) : null;
    const value = stored === null ? NaN : Number(stored);
    if (Number.isFinite(value) && value >= MIN_HEIGHT && value <= MAX_HEIGHT) height = value;
   } catch { /* Storage may be blocked or full; resizing still works. */ }
   setHeight(height); content.scrollTop = 0;
  },
 };
}
