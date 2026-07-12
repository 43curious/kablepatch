export const SIGNAL_TYPES = {
  analog_audio: { color: '#4CAF50', label: 'Analog Audio' },
  digital_audio: { color: '#2196F3', label: 'AES/EBU Digital' },
  madi: { color: '#9C27B0', label: 'MADI' },
  dante: { color: '#FF9800', label: 'Dante/AoIP' },
  sdi: { color: '#F44336', label: 'SDI Video' },
  hdmi: { color: '#E91E63', label: 'HDMI' },
  ethernet: { color: '#00BCD4', label: 'Ethernet/IP' },
  usb: { color: '#607D8B', label: 'USB' },
  midi: { color: '#FF5722', label: 'MIDI' },
  gpio: { color: '#795548', label: 'GPIO/Tally' },
  power: { color: '#FFC107', label: 'Power/AC' },
  fiber: { color: '#8BC34A', label: 'Fiber/SFP' },
} as const;

export type SignalType = keyof typeof SIGNAL_TYPES;

export const CATEGORY_COLORS: Record<string, string> = {
  'Audio Consoles': '#1565C0',
  'Audio Interfaces / Converters': '#6A1B9A',
  'Video Switchers': '#B71C1C',
  'Video Routers': '#E65100',
  'Broadcast Cameras': '#2E7D32',
  'Processors / DSP': '#4E342E',
  'Intercom / Comms': '#37474F',
  'Patch Bays': '#455A64',
  'Playback / Recording': '#1A237E',
  Monitoring: '#004D40',
  Custom: '#334155',
};

export type NodeTemplate = {
  id: string;
  label: string;
  category: string;
  icon: string;
  defaultInputs: string[];
  defaultOutputs: string[];
};

const t = (id: string, label: string, category: string, icon: string, defaultInputs: string[], defaultOutputs: string[]): NodeTemplate =>
  ({ id, label, category, icon, defaultInputs, defaultOutputs });

export const NODE_TYPES: NodeTemplate[] = [
  t('yamaha-tf1', 'Yamaha TF1', 'Audio Consoles', '🎚️', ['CH 1-16 XLR', 'ST IN 1-4', 'DANTE IN 1-16'], ['MIX 1-16', 'MASTER L/R', 'DANTE OUT 1-16', 'MON OUT']),
  t('yamaha-cl5', 'Yamaha CL5', 'Audio Consoles', '🎚️', ['CH 1-72', 'DANTE IN'], ['MIX 1-24', 'MATRIX 1-8', 'DANTE OUT']),
  t('ssl-9000', 'SSL 9000', 'Audio Consoles', '🎚️', ['CH 1-48'], ['BUSS 1-8', 'MASTER']),
  t('generic-mixer', 'Generic Mixer', 'Audio Consoles', '🎚️', ['IN 1-8'], ['OUT 1-4', 'MAIN L/R']),
  t('audient-oria', 'Audient Oria', 'Audio Interfaces / Converters', '🎛️', ['MIC/LINE 1-8', 'DANTE IN 1-64', 'TOSLINK'], ['LINE OUT 1-8', 'DANTE OUT 1-64', 'PHONES']),
  t('dad-core-256', 'DAD Core 256', 'Audio Interfaces / Converters', '🎛️', ['MADI 1-128', 'DANTE IN 1-256', 'AES IN 1-8'], ['MADI OUT 1-128', 'DANTE OUT 1-256', 'AES OUT 1-8']),
  t('rme-fireface-802', 'RME Fireface 802', 'Audio Interfaces / Converters', '🎛️', ['MIC 1-4', 'LINE 5-8', 'ADAT 1-16', 'SPDIF'], ['LINE 1-8', 'ADAT OUT', 'SPDIF OUT']),
  t('generic-ad-da', 'Generic AD/DA', 'Audio Interfaces / Converters', '🎛️', ['ANA IN 1-8'], ['ANA OUT 1-8', 'AES OUT']),
  t('atem-4k8', 'Blackmagic ATEM 4K8', 'Video Switchers', '🎞️', ['SDI IN 1-8', 'HDMI IN 1-2'], ['SDI PGM', 'SDI PVW', 'AUX 1-6', 'MULTI 1-4']),
  t('atem-constellation', 'Blackmagic ATEM Constellation', 'Video Switchers', '🎞️', ['SDI IN 1-40'], ['SDI PGM 1-4', 'ME 1-4', 'AUX 1-24']),
  t('tricaster-tc1', 'TriCaster TC1', 'Video Switchers', '🎞️', ['NDI IN 1-16', 'SDI IN 1-4'], ['PGM', 'PVW', 'ISO 1-4', 'NDI OUT']),
  t('vmix', 'vMix', 'Video Switchers', '🎞️', ['SDI IN 1-4', 'NDI IN 1-16'], ['PGM', 'PVW', 'MULTIVIEW']),
  t('videohub-40', 'Blackmagic Videohub 40x40', 'Video Routers', '🔀', ['SDI IN 1-40'], ['SDI OUT 1-40']),
  t('smarthub-20', 'BM SmartHub 20x20', 'Video Routers', '🔀', ['SDI IN 1-20'], ['SDI OUT 1-20']),
  t('generic-router', 'Generic Router NxN', 'Video Routers', '🔀', ['IN 1-8'], ['OUT 1-8']),
  t('generic-camera', 'Generic Camera', 'Broadcast Cameras', '📹', ['RETURN VIDEO', 'IFB AUDIO', 'TALLY'], ['SDI OUT', 'HDMI OUT', 'AUDIO OUT L/R']),
  t('box-camera', 'Box Camera', 'Broadcast Cameras', '📹', ['CONTROL', 'TALLY'], ['SDI OUT 1-2']),
  t('dolby-atmos-renderer', 'Dolby Atmos Renderer', 'Processors / DSP', '🧠', ['DANTE IN 1-128', 'MADI IN 1-64'], ['BED L/R/C/LFE/Ls/Rs', 'OBJ 1-118', 'BINAURAL']),
  t('bss-soundweb', 'BSS Soundweb', 'Processors / DSP', '🧠', ['ANA IN 1-8', 'AES IN 1-8', 'DANTE IN'], ['ANA OUT 1-8', 'AES OUT', 'DANTE OUT']),
  t('waves-soundgrid', 'Waves SoundGrid', 'Processors / DSP', '🧠', ['DANTE IN', 'MADI IN'], ['DANTE OUT', 'MADI OUT']),
  t('riedel-artist', 'Riedel Artist', 'Intercom / Comms', '🎧', ['PORT 1-32', 'DANTE IN'], ['PORT 1-32', 'DANTE OUT']),
  t('hollyland-syscom', 'Hollyland Syscom', 'Intercom / Comms', '🎧', ['BNC IN 1-4', 'XLR IN'], ['BNC OUT 1-4', 'XLR OUT']),
  t('generic-intercom', 'Generic Intercom Matrix', 'Intercom / Comms', '🎧', ['PORT 1-16'], ['PORT 1-16']),
  t('audio-patchbay-48', 'Audio Patchbay 48pt', 'Patch Bays', '🔌', ['IN 1-48'], ['OUT 1-48']),
  t('video-patchbay-32', 'Video Patchbay 32pt', 'Patch Bays', '🔌', ['SDI IN 1-32'], ['SDI OUT 1-32']),
  t('hyperdeck-studio', 'HyperDeck Studio', 'Playback / Recording', '⏺️', ['SDI IN', 'HDMI IN', 'AES IN'], ['SDI OUT', 'HDMI OUT', 'AES OUT']),
  t('pro-tools-hdx', 'Pro Tools|HDX', 'Playback / Recording', '⏺️', ['TDM IN 1-32', 'DANTE IN', 'MADI IN'], ['TDM OUT 1-32', 'DANTE OUT', 'MADI OUT']),
  t('adam-t7v', 'ADAM T7V (x1)', 'Monitoring', '🔊', ['XLR IN', 'RCA IN'], []),
  t('monitor-controller', 'Monitor Controller', 'Monitoring', '🔊', ['IN 1-4 STEREO', 'HEADPHONE IN'], ['SPEAKER OUT A/B/C', 'PHONES 1-2']),
  t('genelec-8040', 'Genelec 8040', 'Monitoring', '🔊', ['XLR IN'], []),
];

export const templateSignal = (label: string): SignalType => {
  const s = label.toLowerCase();
  if (s.includes('dante') || s.includes('ndi')) return 'dante';
  if (s.includes('madi')) return 'madi';
  if (s.includes('sdi') || s.includes('video') || s.includes('pgm') || s.includes('pvw')) return 'sdi';
  if (s.includes('hdmi')) return 'hdmi';
  if (s.includes('aes') || s.includes('spdif') || s.includes('adat') || s.includes('tdm')) return 'digital_audio';
  if (s.includes('tally') || s.includes('gpio')) return 'gpio';
  if (s.includes('control') || s.includes('port')) return 'ethernet';
  return 'analog_audio';
};
