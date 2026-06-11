import Phaser from "phaser";

export class PreloaderScene extends Phaser.Scene {
  constructor() {
    super("preloader");
  }

  create() {
    this.createCircleTexture("player-warrior", 0x22c55e, 13);
    this.createCircleTexture("player-archer", 0x38bdf8, 13);
    this.createCircleTexture("player-mage", 0xa78bfa, 13);
    this.createCircleTexture("player-healer", 0xf9a8d4, 13);
    this.createCircleTexture("player-tank", 0xfacc15, 15);
    this.createCircleTexture("enemy-grunt", 0xef4444, 11);
    this.createCircleTexture("enemy-brute", 0xb91c1c, 15);
    this.createCircleTexture("enemy-runner", 0xfb923c, 9);
    this.createCircleTexture("enemy-shooter", 0xf97316, 10);
    this.createCircleTexture("projectile-arrow", 0xbae6fd, 4);
    this.createCircleTexture("projectile-bolt", 0x86efac, 4);
    this.createCircleTexture("projectile-orb", 0xc4b5fd, 6);
    this.createCircleTexture("projectile-light", 0xfbcfe8, 4);
    this.createCircleTexture("projectile-chain", 0xfef08a, 5);
    this.createCircleTexture("projectile-enemy", 0xfb7185, 4);
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
