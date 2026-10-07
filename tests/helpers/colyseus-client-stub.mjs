/**
 * Node testleri icin `colyseus.js` yerine gecen kucuk koca.
 *
 * Gercek istemci node'da ESM olarak paketlenemiyor. Oturum modulu
 * (`online-session.ts`) istemciyi yalnizca kuruyor ve odaya yonlendiriyor;
 * testler sahte oda nesneleri veriyor. Baglanti kurmaya kalkan test burada
 * acikca hata aliyor.
 */
export class Client {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  async create() {
    throw new Error("colyseus.js koca: baglanti yok");
  }

  async joinById() {
    throw new Error("colyseus.js koca: baglanti yok");
  }

  async reconnect() {
    throw new Error("colyseus.js koca: baglanti yok");
  }
}

export class Room {}
