// Musique de la salle : lecteur YouTube synchronisé sur l'heure du serveur.
// L'hôte choisit les titres ; chaque joueur règle son propre volume ou coupe le son.
import { storage } from './util.js';

let apiPromise = null;
function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('YouTube inaccessible'));
    document.head.append(s);
  });
  return apiPromise;
}

export class MusicPlayer {
  constructor({ onEnded, onChange } = {}) {
    this.onEnded = onEnded;
    this.onChange = onChange || (() => {});
    this.volume = Number(storage('musicVol') ?? 60);
    if (!Number.isFinite(this.volume)) this.volume = 60;
    this.muted = storage('musicMute') === '1';
    this.track = null; // { id, title, startedAt }
    this.offset = 0; // décalage horloge serveur
    this.blocked = false; // lecture bloquée par le navigateur (autoplay)
    this.host = document.createElement('div');
    this.host.className = 'yt-host';
    this.host.innerHTML = '<div></div>';
    document.body.append(this.host);
  }

  elapsed() {
    if (!this.track) return 0;
    return Math.max(0, (Date.now() + this.offset - this.track.startedAt) / 1000);
  }

  /** Applique l'état musical reçu du serveur. */
  async sync(music) {
    const cur = music && music.current;
    if (music && music.serverNow) this.offset = music.serverNow - Date.now();
    if (!cur) {
      this.track = null;
      if (this.ok) this.player.stopVideo();
      this.onChange();
      return;
    }
    const changed = !this.track || this.track.id !== cur.id || this.track.startedAt !== cur.startedAt;
    this.track = cur;
    if (!changed) return;
    try {
      await this.ensure();
    } catch {
      return this.onChange();
    }
    if (!this.ok) return this.onChange();
    this.player.loadVideoById({ videoId: cur.id, startSeconds: this.elapsed() });
    this.applyVolume();
    this.checkBlocked();
    this.onChange();
  }

  async ensure() {
    if (this.player) return this.ready;
    const YT = await loadApi();
    this.ready = new Promise((resolve) => {
      this.player = new YT.Player(this.host.firstChild, {
        width: 200,
        height: 113,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            this.applyVolume();
            resolve();
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED && this.track && this.onEnded) this.onEnded(this.track.id);
            if (e.data === YT.PlayerState.PLAYING) {
              this.blocked = false;
              // Recale la lecture si elle a pris du retard sur les autres joueurs
              const drift = Math.abs(this.player.getCurrentTime() - this.elapsed());
              if (drift > 4) this.player.seekTo(this.elapsed(), true);
              this.onChange();
            }
          },
          onError: () => this.onChange(),
        },
      });
    });
    return this.ready;
  }

  /** Les navigateurs bloquent parfois le son sans interaction : on propose alors un bouton. */
  checkBlocked() {
    clearTimeout(this.blockTimer);
    this.blockTimer = setTimeout(() => {
      const st = this.player && this.player.getPlayerState ? this.player.getPlayerState() : -1;
      this.blocked = !!this.track && st !== 1 && st !== 3;
      this.onChange();
    }, 2500);
  }
  /** Vrai quand le lecteur YouTube est prêt à recevoir des commandes. */
  get ok() {
    return !!(this.player && typeof this.player.seekTo === 'function');
  }
  resume() {
    if (!this.ok || !this.track) return;
    this.player.seekTo(this.elapsed(), true);
    this.player.playVideo();
    this.applyVolume();
    this.checkBlocked();
  }

  applyVolume() {
    if (!this.ok) return;
    this.player.setVolume(this.volume);
    if (this.muted || this.volume === 0) this.player.mute();
    else this.player.unMute();
  }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(100, Math.round(v)));
    if (this.volume > 0) this.muted = false;
    storage('musicVol', String(this.volume));
    storage('musicMute', this.muted ? '1' : '0');
    this.applyVolume();
    this.onChange();
  }
  toggleMute() {
    this.muted = !this.muted;
    storage('musicMute', this.muted ? '1' : '0');
    this.applyVolume();
    this.onChange();
  }

  destroy() {
    clearTimeout(this.blockTimer);
    try {
      if (this.player && this.player.destroy) this.player.destroy();
    } catch {}
    this.host.remove();
  }
}
