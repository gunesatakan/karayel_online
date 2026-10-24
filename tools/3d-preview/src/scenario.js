// This is a repeatable visual fixture, not a copy of Karayel's combat rules.
export const CYCLE = 12;
export const SHOT_PERIOD = 0.62;
export const FLIGHT_TIME = 0.42;
export const TOWER_POSITION = { x: -3.45, z: 0.65 };

export function enemyPosition(time) {
  return {
    x: 3.3 + Math.sin(time * 0.53) * 0.65,
    z: Math.sin(time * 0.64) * 2.7,
  };
}

export function weaponAt(time, mode) {
  return mode === "auto" ? (time % CYCLE < 6 ? "projectile" : "beam") : mode;
}

export function beamActive(time, mode) {
  return weaponAt(time, mode) === "beam" && time % 1.8 < 1.35;
}

export function shotEnabled(at, mode) {
  return at >= 0 && weaponAt(at, mode) === "projectile";
}

export function muzzleAt(time, offset = 0, length = 1.7, height = 2.02) {
  const target = enemyPosition(time);
  const dx = target.x - TOWER_POSITION.x;
  const dz = target.z - TOWER_POSITION.z;
  const len = Math.hypot(dx, dz);
  return {
    x: TOWER_POSITION.x + (dx / len) * length + (dz / len) * offset,
    y: height,
    z: TOWER_POSITION.z + (dz / len) * length - (dx / len) * offset,
  };
}

export function projectileAt(index, time) {
  const born = index * SHOT_PERIOD;
  const from = muzzleAt(born, index % 2 ? -0.25 : 0.25);
  const end = enemyPosition(born + FLIGHT_TIME);
  const to = { x: end.x, y: 1.05, z: end.z };
  const progress = Math.max(0, Math.min(1, (time - born) / FLIGHT_TIME));
  return {
    from,
    to,
    progress,
    position: {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      z: from.z + (to.z - from.z) * progress,
    },
  };
}

// Return each impact once, even when a slow frame crosses multiple contacts.
export function impactsBetween(from, to, mode) {
  const events = [];
  if (to <= from) return events;
  // Inspect an extra boundary candidate: e.g. 17.5 / .14 can round below 125.
  // The timestamp filter below still prevents early or duplicate contacts.
  for (
    let i = Math.max(0, Math.floor((from - FLIGHT_TIME) / SHOT_PERIOD) - 1);
    i <= Math.floor((to - FLIGHT_TIME) / SHOT_PERIOD) + 1;
    i++
  ) {
    const at = i * SHOT_PERIOD + FLIGHT_TIME;
    if (at > from && at <= to && shotEnabled(i * SHOT_PERIOD, mode))
      events.push({ at, kind: "projectile" });
  }
  for (
    let i = Math.max(0, Math.floor(from / 0.14) - 1);
    i <= Math.floor(to / 0.14) + 1;
    i++
  ) {
    const at = i * 0.14;
    if (at > from && at <= to && beamActive(at, mode))
      events.push({ at, kind: "beam" });
  }
  return events.sort((a, b) => a.at - b.at);
}
