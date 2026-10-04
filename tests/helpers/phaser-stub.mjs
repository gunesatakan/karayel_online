/**
 * Node testleri icin Phaser yerine gecen kucuk koca.
 *
 * Istemcinin saf cizim modulleri Phaser'i yalnizca tip olarak kullaniyor;
 * bu dosya bir modul yanlislikla calisma aninda Phaser isterse paketlemenin
 * kirilmasin diye var. Gercek bir sahne, doku ya da WebGL saglamiyor.
 */
const Phaser = {
  Math: {
    Clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    Linear: (from, to, t) => from + (to - from) * t,
    Distance: { Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) }
  },
  Geom: {
    Point: class Point {
      constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
      }
    }
  },
  BlendModes: { NORMAL: 0, ADD: 1 }
};

export default Phaser;
