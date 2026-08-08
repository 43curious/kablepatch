import { describe, expect, it } from 'vitest';
import { historyShortcut, shouldStartCanvasPan } from './canvasInteractions';

describe('canvas pan gestures', () => {
  it('allows middle-button panning over blank areas and SVG groups', () => {
    expect(shouldStartCanvasPan(1, false, false)).toBe(true);
    expect(shouldStartCanvasPan(1, false, true)).toBe(true);
  });

  it('preserves left-button space selection and blank-space panning behavior', () => {
    expect(shouldStartCanvasPan(0, false, false)).toBe(false);
    expect(shouldStartCanvasPan(0, false, true)).toBe(false);
    expect(shouldStartCanvasPan(0, true, false)).toBe(true);
    expect(shouldStartCanvasPan(0, true, true)).toBe(false);
  });
});

describe('history shortcuts', () => {
  it('supports only Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z', () => {
    expect(historyShortcut('z', true, false, false)).toBe('undo');
    expect(historyShortcut('Z', false, true, true)).toBe('redo');
    expect(historyShortcut('y', true, false, false)).toBeUndefined();
    expect(historyShortcut('z', false, false, false)).toBeUndefined();
  });
});
