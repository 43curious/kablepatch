import { normalizeCanvasData, uniqueSpaceName } from '../../store/canvasDocument';
import type { CanvasData } from '../../store/canvasDocument';

export type SharedCanvas = CanvasData;
export type CanvasDocument = { type: 'iko-connect'; version: 1; readOnly: boolean; canvas: SharedCanvas };
type ProtectedDocument = { type: 'iko-connect-protected'; version: 1; salt: string; iv: string; data: string };

const encoder = new TextEncoder(), decoder = new TextDecoder();
const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
const bytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const documentFor = (canvas: SharedCanvas, readOnly: boolean): CanvasDocument => ({ type: 'iko-connect', version: 1, readOnly, canvas });

export { uniqueSpaceName };

export const canvasJson = (canvas: SharedCanvas) => JSON.stringify(documentFor(canvas, false), null, 2);
export const protectedViewJson = async (canvas: SharedCanvas, password: string) => {
  if (!password) throw new Error('A password is required');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(documentFor(canvas, true))));
  return JSON.stringify({ type: 'iko-connect-protected', version: 1, salt: base64(salt), iv: base64(iv), data: base64(new Uint8Array(data)) } satisfies ProtectedDocument, null, 2);
};

const normalizeDocument = (document: CanvasDocument): CanvasDocument | null => {
  if (document?.type !== 'iko-connect' || document.version !== 1 || typeof document.readOnly !== 'boolean') return null;
  const canvas = normalizeCanvasData(document.canvas);
  return canvas ? { ...document, canvas } : null;
};

export const openCanvasFile = async (text: string, password = ''): Promise<CanvasDocument | 'password-required' | null> => {
  try {
    const file = JSON.parse(text) as CanvasDocument | ProtectedDocument;
    const plain = normalizeDocument(file as CanvasDocument);
    if (plain) return plain;
    if (file.type !== 'iko-connect-protected' || file.version !== 1 || !file.salt || !file.iv || !file.data) return null;
    if (!password) return 'password-required';
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(file.salt), iterations: 100000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(file.iv) }, key, bytes(file.data));
    const document = JSON.parse(decoder.decode(data)) as CanvasDocument;
    return normalizeDocument(document);
  } catch { return null; }
};
