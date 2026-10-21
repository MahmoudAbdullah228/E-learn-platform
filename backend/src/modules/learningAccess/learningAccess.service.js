import { prepareSignedPlayback, playbackUnavailable } from '../../services/videoPlayback.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { resolveLearningAccess } from './learningAccess.policy.js';

export function createLearningAccessService({ videoProvider, mediaProvider, videoService,
  clock = () => new Date(), operationTimeoutMs = 30_000, shutdownTimeoutMs = 10_000 }) {
  const shutdown = new AbortController();
  const running = new Set();
  const downloadUnavailable = () => new ApiError(503, 'MEDIA_PROVIDER_UNAVAILABLE',
    'File downloads are temporarily unavailable');

  async function operation(work, unavailable = playbackUnavailable) {
    if (shutdown.signal.aborted) throw unavailable();
    const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(operationTimeoutMs)]);
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(unavailable());
      signal.addEventListener('abort', onAbort, { once: true });
      const pending = Promise.resolve().then(() => { signal.throwIfAborted(); return work(signal); });
      running.add(pending);
      pending.then(resolve, error => reject(signal.aborted ? unavailable() : error))
        .finally(() => { running.delete(pending); signal.removeEventListener('abort', onAbort); });
    });
  }

  return Object.freeze({
    async stop() {
      shutdown.abort();
      let timer;
      try {
        await Promise.race([Promise.allSettled([...running]), new Promise(resolve => {
          timer = setTimeout(resolve, shutdownTimeoutMs);
        })]);
      } finally { clearTimeout(timer); }
    },
    async playback(input) {
      return operation(async signal => {
        const access = () => resolveLearningAccess({ ...input, kind: 'playback', clock, signal });
        const initial = await access();
        signal.throwIfAborted();
        let playbackId;
        try {
          playbackId = await prepareSignedPlayback({ lessonId: input.lessonId,
            assetId: initial.lesson.videoAssetId, provider: videoProvider, signal, clock });
        } catch (error) {
          if (!signal.aborted && error?.code === 'VIDEO_ASSET_UNAVAILABLE') {
            await videoService.markAssetUnavailable(initial.lesson.videoAssetId);
          }
          throw error;
        }
        signal.throwIfAborted();
        const signed = await videoProvider.signPlaybackToken(playbackId);
        signal.throwIfAborted();
        const current = await access();
        signal.throwIfAborted();
        if (current.lesson.videoAssetId !== initial.lesson.videoAssetId) {
          throw new ApiError(409, 'VIDEO_STATE_CHANGED', 'The lesson video changed. Please retry');
        }
        if (typeof playbackId !== 'string' || !playbackId || typeof signed?.token !== 'string'
            || !signed.token || !(signed.expiresAt instanceof Date)
            || signed.expiresAt <= clock() || signed.expiresAt > new Date(clock().getTime() + 901_000)) {
          throw playbackUnavailable();
        }
        return { playbackId, token: signed.token, expiresAt: signed.expiresAt };
      });
    },
    async download(input) {
      return operation(async signal => {
        const access = () => resolveLearningAccess({ ...input, kind: 'download', clock, signal });
        const initial = await access();
        signal.throwIfAborted();
        const signed = await mediaProvider.createPrivateDownload({ publicId: initial.asset.publicId,
          format: 'pdf' });
        signal.throwIfAborted();
        const current = await access();
        signal.throwIfAborted();
        if (current.asset.publicId !== initial.asset.publicId) throw downloadUnavailable();
        if (typeof signed?.url !== 'string' || !URL.canParse(signed.url)
            || new URL(signed.url).protocol !== 'https:' || !(signed.expiresAt instanceof Date)
            || signed.expiresAt <= clock() || signed.expiresAt > new Date(clock().getTime() + 61_000)) {
          throw new ApiError(503, 'MEDIA_PROVIDER_UNAVAILABLE', 'File downloads are temporarily unavailable');
        }
        return { url: signed.url, expiresAt: signed.expiresAt };
      }, downloadUnavailable);
    },
  });
}
