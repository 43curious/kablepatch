import { assert, it } from 'vitest';
import { canvasJson, openCanvasFile, protectedViewJson, uniqueSpaceName } from './share';
import type { Node } from '../../types/graph';

it('round-trips editable and protected canvas files', async () => {
const node: Node = { id: 'microphone', label: 'Microphone', category: 'Audio', headerColor: '#000', position: { x: 0, y: 0 }, ports: [{ id: 'out', label: 'XLR OUT', side: 'output', signalType: 'analog_audio' }] };
node.space = 'Studio';
const canvas = { nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, spaces: [{ name: 'Studio', color: '#c7d2fe' }] };
const usedNames = new Set(['Studio', 'Studio-1']);
assert.equal(uniqueSpaceName('Studio', usedNames), 'Studio-2');
assert.deepEqual(await openCanvasFile(canvasJson(canvas)), { type: 'iko-connect', version: 1, readOnly: false, canvas });
const protectedView = await protectedViewJson(canvas, 'test-password');
assert.equal(await openCanvasFile(protectedView), 'password-required');
assert.deepEqual(await openCanvasFile(protectedView, 'test-password'), { type: 'iko-connect', version: 1, readOnly: true, canvas });
});
