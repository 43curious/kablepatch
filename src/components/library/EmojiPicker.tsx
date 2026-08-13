import { useState } from 'react';

const EMOJIS = ['🎚️', '🎛️', '🎙️', '🎧', '🔊', '📺', '🎥', '📹', '💻', '🖥️', '⌨️', '📡', '🌐', '🔌', '🔋', '⚡', '💡', '📦', '🗄️', '🔀', '🎵', '🎬', '📻', '🛰️'];

export default function EmojiPicker({ value, onChange }: { value?: string; onChange: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="emoji-picker">
    <button className="emoji-picker-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}><span aria-hidden="true">{value || '＋'}</span><span>{value ? 'Change icon' : 'Choose icon'}</span></button>
    {open && <div className="emoji-picker-popover" role="dialog" aria-label="Choose component emoji">
      <div className="emoji-grid">{EMOJIS.map(emoji => <button type="button" key={emoji} className={value === emoji ? 'active' : ''} aria-label={`Use ${emoji}`} aria-pressed={value === emoji} onClick={() => { onChange(emoji); setOpen(false); }}>{emoji}</button>)}</div>
      {value && <button className="emoji-clear" type="button" onClick={() => { onChange(''); setOpen(false); }}>Remove icon</button>}
    </div>}
  </div>;
}
