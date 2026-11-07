/**
 * <at-card-video>: plays a muted product-card clip only while it is on screen.
 * Stays on the poster image when the visitor prefers reduced motion or has data saver on.
 */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const saveData = Boolean(navigator.connection && navigator.connection.saveData);

const observer =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const element = /** @type {AtCardVideo} */ (entry.target);
            if (entry.isIntersecting) element.play();
            else element.pause();
          }
        },
        { threshold: 0.4 }
      )
    : null;

class AtCardVideo extends HTMLElement {
  connectedCallback() {
    this.video = this.querySelector('video');
    if (!this.video || saveData) return;

    this.video.muted = true;
    this.onMotionChange = () => (reducedMotion.matches ? this.pause() : this.syncWithViewport());
    reducedMotion.addEventListener('change', this.onMotionChange);
    document.addEventListener('visibilitychange', this.onMotionChange);

    if (observer) observer.observe(this);
    else this.play();
  }

  disconnectedCallback() {
    if (observer) observer.unobserve(this);
    if (this.onMotionChange) {
      reducedMotion.removeEventListener('change', this.onMotionChange);
      document.removeEventListener('visibilitychange', this.onMotionChange);
    }
  }

  syncWithViewport() {
    if (!this.video) return;
    const rect = this.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < window.innerHeight;
    if (visible) this.play();
  }

  play() {
    const video = this.video;
    if (!video || reducedMotion.matches || document.hidden) return;
    if (video.preload !== 'auto') video.preload = 'auto';
    const attempt = video.play();
    if (attempt) attempt.catch(() => {});
  }

  pause() {
    if (this.video && !this.video.paused) this.video.pause();
  }
}

if (!customElements.get('at-card-video')) customElements.define('at-card-video', AtCardVideo);
