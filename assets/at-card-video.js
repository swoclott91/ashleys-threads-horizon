/**
 * <at-card-video>: plays a muted product-card clip only while it is on screen.
 * - Loads nothing until the clip first scrolls into view.
 * - Uses Shopify's adaptive HLS stream where the browser plays it natively (iPhone, iPad, Safari),
 *   otherwise the MP4.
 * - Stays on the poster image when the visitor prefers reduced motion or has data saver on.
 */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const saveData = Boolean(navigator.connection && navigator.connection.saveData);

/** Native HLS (no MediaSource library needed): every iOS/iPadOS browser and desktop Safari. */
function prefersNativeHls(video) {
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|ad|od)/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const isDesktopSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
  return (isIOS || isDesktopSafari) && video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

const observer =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const element = /** @type {AtCardVideo} */ (entry.target);
            element.inView = entry.isIntersecting;
            element.update();
          }
        },
        { threshold: 0.4 }
      )
    : null;

class AtCardVideo extends HTMLElement {
  inView = false;

  connectedCallback() {
    this.video = this.querySelector('video');
    if (!this.video || saveData) return;

    this.video.muted = true;
    this.update = this.update.bind(this);
    reducedMotion.addEventListener('change', this.update);
    document.addEventListener('visibilitychange', this.update);

    if (observer) {
      observer.observe(this);
    } else {
      this.inView = true;
      this.update();
    }
  }

  disconnectedCallback() {
    if (observer) observer.unobserve(this);
    reducedMotion.removeEventListener('change', this.update);
    document.removeEventListener('visibilitychange', this.update);
  }

  /** Play while visible; pause otherwise. */
  update() {
    const video = this.video;
    if (!video) return;

    if (!this.inView || reducedMotion.matches || document.hidden) {
      if (!video.paused) video.pause();
      return;
    }

    if (!video.currentSrc && !video.getAttribute('src')) {
      const hls = video.dataset.srcHls;
      const mp4 = video.dataset.srcMp4;
      const src = hls && prefersNativeHls(video) ? hls : mp4 || hls;
      if (!src) return;
      video.preload = 'auto';
      video.src = src;
    }

    const attempt = video.play();
    if (attempt) attempt.catch(() => {});
  }
}

if (!customElements.get('at-card-video')) customElements.define('at-card-video', AtCardVideo);
