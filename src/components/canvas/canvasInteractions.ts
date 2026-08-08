export const shouldStartCanvasPan = (button: number, spacePressed: boolean, insideGroup: boolean) =>
  button === 1 || spacePressed && !insideGroup;

export const historyShortcut = (key: string, control: boolean, meta: boolean, shift: boolean): 'undo' | 'redo' | undefined =>
  (control || meta) && key.toLowerCase() === 'z' ? shift ? 'redo' : 'undo' : undefined;
