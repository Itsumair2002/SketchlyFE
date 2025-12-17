import React from 'react';

import {
  LiaHandPaper,
  LiaHandRock,
} from 'react-icons/lia';
import {
  PiCursorFill,
  PiHandPointing,
  PiRectangleBold,
  PiCircleBold,
  PiLineSegmentBold,
  PiArrowRightBold,
  PiPencilBold,
  PiTextTBold,
  PiEraserBold,
} from 'react-icons/pi';
import { FiSettings } from 'react-icons/fi';

const iconSize = 18;

const tools = [
  {
    key: 'select',
    label: 'Select',
    icon: <PiCursorFill size={iconSize} />,
  },
  {
    key: 'pan',
    label: 'Pan',
    icon: <LiaHandPaper size={iconSize} />,
  },
  {
    key: 'rectangle',
    label: 'Rectangle',
    icon: <PiRectangleBold size={iconSize} />,
  },
  {
    key: 'ellipse',
    label: 'Ellipse',
    icon: <PiCircleBold size={iconSize} />,
  },
  {
    key: 'line',
    label: 'Line',
    icon: <PiLineSegmentBold size={iconSize} />,
  },
  {
    key: 'arrow',
    label: 'Arrow',
    icon: <PiArrowRightBold size={iconSize} />,
  },
  {
    key: 'freehand',
    label: 'Freehand',
    icon: <PiPencilBold size={iconSize} />,
  },
  {
    key: 'text',
    label: 'Text',
    icon: <PiTextTBold size={iconSize} />,
  },
  { key: 'erase', label: 'Erase', icon: <PiEraserBold size={iconSize} /> },
];

export default function Toolbar({ activeTool, setActiveTool, color, setColor, strokeWidth, setStrokeWidth, direction = 'vertical' }) {
  const dirClass = direction === 'vertical' ? 'flex-col' : 'flex-row flex-wrap';
  return (
    <div className={`flex ${dirClass} gap-2 items-start`}>
      {tools.map((tool) => (
        <button
          key={tool.key}
          onClick={() => setActiveTool(tool.key)}
          className={`w-12 h-12 rounded-md text-sm border transition flex items-center justify-center ${
            activeTool === tool.key
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.4)]'
              : 'bg-black text-slate-200 border-slate-700 hover:border-slate-500'
          }`}
        >
          {tool.icon}
        </button>
      ))}
      <ColorStrokePicker color={color} setColor={setColor} strokeWidth={strokeWidth} setStrokeWidth={setStrokeWidth} />
    </div>
  );
}

function ColorStrokePicker({ color, setColor, strokeWidth, setStrokeWidth }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 rounded-md text-sm border transition flex items-center justify-center bg-black text-slate-200 border-slate-700 hover:border-slate-500"
      >
        <FiSettings size={iconSize} />
      </button>
      {open && (
        <div className="absolute left-14 top-0 z-30 bg-black border border-slate-800 rounded-lg p-3 shadow-xl min-w-[160px]">
          <div className="flex items-center gap-2 text-xs text-slate-200 mb-3">
            <span>Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-10 bg-black border border-slate-700 rounded cursor-pointer"
            />
            <div className="w-4 h-4 rounded-full border border-slate-600" style={{ background: color }} />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-200">
            <span className="w-12">Stroke</span>
            <input
              type="range"
              min="1"
              max="8"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="accent-emerald-500 flex-1"
            />
            <span className="w-6 text-right text-xs text-slate-400">{strokeWidth}</span>
          </div>
        </div>
      )}
    </div>
  );
}
