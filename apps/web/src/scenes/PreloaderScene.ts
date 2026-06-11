import Phaser from "phaser";

export class PreloaderScene extends Phaser.Scene {
  constructor() {
    super("preloader");
  }

  create() {
    this.createCircleTexture("player-warrior", 0x22c55e, 18);
    this.createCircleTexture("player-archer", 0x38bdf8, 18);
    this.createCircleTexture("player-mage", 0xa78bfa, 18);
    this.createCircleTexture("player-healer", 0xf9a8d4, 18);
    this.createCircleTexture("player-tank", 0xfacc15, 20);
    this.createCircleTexture("enemy-grunt", 0xef4444, 16);
    this.createCircleTexture("enemy-brute", 0xb91c1c, 22);
    this.createCircleTexture("enemy-runner", 0xfb923c, 13);
    this.createCircleTexture("enemy-shooter", 0xf97316, 15);
    this.createCircleTexture("projectile-arrow", 0xbae6fd, 5);
    this.createCircleTexture("projectile-bolt", 0x86efac, 6);
    this.createCircleTexture("projectile-orb", 0xc4b5fd, 8);
    this.createCircleTexture("projectile-light", 0xfbcfe8, 6);
    this.createCircleTexture("projectile-chain", 0xfef08a, 7);
    this.createCircleTexture("projectile-enemy", 0xfb7185, 6);
    this.scene.start("main-menu");
  }

  private createCircleTexture(key: string, color: number, radius: number) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(color, 1);
    graphics.fillCircle(radius, radius, radius);
    graphics.generateTexture(key, radius * 2, radius * 2);
    graphics.destroy();
  }
}
