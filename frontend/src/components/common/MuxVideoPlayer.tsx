import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface MuxVideoPlayerProps {
  playbackId: string;
  token: string;
  expiresAt?: string;
  title?: string;
  onRenewToken?: () => void;
  className?: string;
}

export function MuxVideoPlayer({
  playbackId,
  token,
  expiresAt,
  title,
  onRenewToken,
  className,
}: MuxVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackId || !token) return;

    const sourceUrl = `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8?token=${encodeURIComponent(token)}`;
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
      });
      hls.loadSource(sourceUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setPlaybackError('Unable to stream this video right now. Please try again.');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = sourceUrl;
    } else {
      setPlaybackError('Your browser does not support HLS video playback.');
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [playbackId, token]);

  useEffect(() => {
    if (!expiresAt || !onRenewToken) return;
    const expiryMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiryMs)) return;

    // Renew 60 seconds prior to signed token expiration (maximum 15 min TTL).
    const delayMs = Math.max(5_000, expiryMs - Date.now() - 60_000);
    const timer = window.setTimeout(() => {
      onRenewToken();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [expiresAt, onRenewToken]);

  return (
    <div
      className={cn(
        'relative aspect-video w-full rounded-lg overflow-hidden bg-video-black',
        className,
      )}
    >
      {playbackError ? (
        <div className="h-full w-full flex items-center justify-center p-md text-center text-[14px] text-on-primary">
          {playbackError}
        </div>
      ) : (
        <video
          ref={videoRef}
          controls
          playsInline
          aria-label={title ?? 'Course video player'}
          className="h-full w-full"
        />
      )}
    </div>
  );
}
