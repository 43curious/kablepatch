import { assert, it } from 'vitest';
import { canvasJson, openCanvasFile, protectedViewJson, uniqueSpaceName } from './share';
import type { Node } from '../../types/graph';

it('round-trips editable and protected canvas files', async () => {
const node: Node = { id: 'encoder', label: 'Encoder', category: 'Video', headerColor: '#000', position: { x: 0, y: 0 }, ports: [{ id: 'network', label: 'ETH', side: 'bidirectional', signalType: 'ethernet' }], vlanIds: ['vlan-10'] };
node.space = 'Studio';
const canvas = { nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, spaces: [{ name: 'Studio', color: '#c7d2fe' }], vlans: [{ id: 'vlan-10', tag: 10, name: 'Control', color: '#22c55e' }] };
const usedNames = new Set(['Studio', 'Studio-1']);
assert.equal(uniqueSpaceName('Studio', usedNames), 'Studio-2');
assert.deepEqual(await openCanvasFile(canvasJson(canvas)), { type: 'iko-connect', version: 1, readOnly: false, canvas });
const protectedView = await protectedViewJson(canvas, 'test-password');
assert.equal(await openCanvasFile(protectedView), 'password-required');
assert.deepEqual(await openCanvasFile(protectedView, 'test-password'), { type: 'iko-connect', version: 1, readOnly: true, canvas });
});
