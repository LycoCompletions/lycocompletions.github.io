export function cryptoRandomId() {
  if (window.crypto?.getRandomValues) {
    const a = new Uint32Array(4);
    crypto.getRandomValues(a);
    return Array.from(a, x => x.toString(16)).join('');
  }
  return 'id_' + Math.random().toString(36).slice(2);
}