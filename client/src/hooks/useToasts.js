import { useCallback, useRef, useState } from 'react';

// Feeds KUI's <ToastStack>. Replaces the blocking alert() that used to be the
// only way the app reported an error.
export function useToasts(defaultTtl = 4000) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const notify = useCallback((message, { type = 'info', emoji, ttl = defaultTtl, key } = {}) => {
    const id = key ?? `t${++idRef.current}`;
    setToasts(list => [...list.filter(t => t.id !== id), { id, message, type, emoji }]);

    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    if (ttl > 0) {
      timersRef.current.set(id, setTimeout(() => dismiss(id), ttl));
    } else {
      timersRef.current.delete(id);
    }
    return id;
  }, [defaultTtl, dismiss]);

  return { toasts, notify, dismiss };
}
