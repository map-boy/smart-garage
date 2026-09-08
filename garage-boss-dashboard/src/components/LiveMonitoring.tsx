import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Camera, CameraOff } from 'lucide-react';

interface LiveMonitoringProps {
  streamUrl?: string;
  label?: string;
}

export default function LiveMonitoring({ streamUrl, label }: LiveMonitoringProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let hls: Hls | null = null;
    const video = videoRef.current;

    if (video && streamUrl) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native browser support (e.g. Safari / iOS Chrome)
        video.src = streamUrl;
      } else if (Hls.isSupported()) {
        hls = new Hls({
          maxBufferLength: 10,
          enableWorker: true,
          lowLatencyMode: true,
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls?.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls?.recoverMediaError();
                break;
              default:
                break;
            }
          }
        });
      }
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [streamUrl]);

  if (!streamUrl) {
    return (
      <div id="camera-not-configured" className="flex flex-col items-center justify-center py-12 px-6 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50 text-gray-400">
        <CameraOff className="w-8 h-8 mb-3 text-gray-300 animate-pulse" />
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Camera Stream</p>
        <p className="text-sm text-gray-500 mt-1">Camera not configured for this garage</p>
      </div>
    );
  }

  return (
    <div id="camera-stream-container" className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-gray-500" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block leading-none">CCTV WORKSHOP</span>
            <h3 className="text-xs font-bold text-gray-800 mt-1">{label || "Workshop Feed"}</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-rose-500">LIVE FEED</span>
        </div>
      </div>
      <div className="relative aspect-video bg-black flex items-center justify-center group">
        <video
          id="cctv-player"
          ref={videoRef}
          controls
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain"
        />
        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[9px] font-mono font-medium text-white tracking-widest uppercase pointer-events-none">
          CAM_01_SEC
        </div>
      </div>
    </div>
  );
}
