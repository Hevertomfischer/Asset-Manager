import { useState, useEffect } from 'react';
import VideoWithControls from "@/components/video/VideoWithControls";
import { SCENE_DURATIONS } from "@/components/video/VideoTemplate";

// Helper to preserve order in durations object
const createClip = (scenes: [string, number][]) => {
  const clip: Record<string, number> = {};
  scenes.forEach(([k, v]) => { clip[k] = v; });
  return clip;
};

const CLIP_MODES = {
  full: SCENE_DURATIONS,
  positioning: createClip([
    ['scene1', 5000],
    ['scene6', 5000]
  ]),
  demonstration: createClip([
    ['scene1', 3000],
    ['scene3', 7000],
    ['scene6', 4000]
  ]),
  explainability: createClip([
    ['scene4', 8000],
    ['scene6', 6000]
  ]),
  comparison: createClip([
    ['scene2', 6000],
    ['scene6', 4000]
  ]),
  transparency: createClip([
    ['scene1', 3000],
    ['scene5', 8000],
    ['scene6', 4000]
  ])
};

export default function App() {
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [clipMode, setClipMode] = useState<keyof typeof CLIP_MODES>('full');
  const [hideUI, setHideUI] = useState(false);
  
  // Support URL params for automation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') as keyof typeof CLIP_MODES;
    const ratio = params.get('ratio') as '9:16' | '16:9';
    const isExport = params.get('export') === 'true';
    
    if (mode && CLIP_MODES[mode]) setClipMode(mode);
    if (ratio === '9:16' || ratio === '16:9') setAspectRatio(ratio);
    if (isExport) setHideUI(true);
  }, []);

  return (
    <div className="relative w-full h-screen bg-black">
      <VideoWithControls 
        key={`${clipMode}-${aspectRatio}`}
        aspectRatio={aspectRatio} 
        clipDurations={CLIP_MODES[clipMode]} 
      />
      
      {/* Top right selector UI */}
      {!hideUI && (
        <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
          <select 
            className="bg-black/80 text-white border border-white/20 p-2 rounded-lg text-sm backdrop-blur"
            value={aspectRatio}
            onChange={e => setAspectRatio(e.target.value as '9:16' | '16:9')}
          >
            <option value="9:16">9:16 (Portrait)</option>
            <option value="16:9">16:9 (Landscape)</option>
          </select>
          
          <select 
            className="bg-black/80 text-white border border-white/20 p-2 rounded-lg text-sm backdrop-blur"
            value={clipMode}
            onChange={e => setClipMode(e.target.value as keyof typeof CLIP_MODES)}
          >
            <option value="full">Full Video</option>
            <option value="positioning">Positioning (10s)</option>
            <option value="demonstration">4-3-3 Demo (14s)</option>
            <option value="explainability">Explainability (14s)</option>
            <option value="comparison">Comparison (10s)</option>
            <option value="transparency">Transparency (15s)</option>
          </select>
        </div>
      )}
    </div>
  );
}