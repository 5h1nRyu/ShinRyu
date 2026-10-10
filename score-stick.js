import { Euler, Quaternion, Vector3 } from './vendor/three.module.js';
import { smooth } from './geometry.js';
import { REAL_SIZE, mm, STICK_CENTER } from './physical-layout.js';

// The same millimeter conversion as the tiles and 2D control box.
export const STICK = Object.freeze({ length: mm(REAL_SIZE.stick.length), width: mm(REAL_SIZE.stick.width), thickness: mm(REAL_SIZE.stick.thickness), x: STICK_CENTER.x, y: -STICK_CENTER.y });
export const MAX_STICK_YAW = 8 * Math.PI / 180;
export const INITIAL_STICK_ANGLE = 3 * Math.PI / 180;
// Screen Y points down; invert the screen angle for the 3D world's Z rotation.
export const REST_STICK = Object.freeze({ x: STICK.x, y: STICK.y, z: STICK.thickness / 2, quaternion: Object.freeze(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -INITIAL_STICK_ANGLE).toArray()) });
const STEP = 1 / 240, PICKUP = 360, GRAVITY = 1600;
export const STICK_PLAYBACK_RATE = 1.5;
export const STICK_PICKUP_DURATION = PICKUP / STICK_PLAYBACK_RATE;
const corners = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
  corners.push(new Vector3(x * STICK.length / 2, y * STICK.width / 2, z * STICK.thickness / 2));
}
const inertia = new Vector3(
  (STICK.width ** 2 + STICK.thickness ** 2) / 12,
  (STICK.length ** 2 + STICK.thickness ** 2) / 12,
  (STICK.length ** 2 + STICK.width ** 2) / 12,
);

export function stickClearance(pose) {
  const q = new Quaternion().fromArray(pose.quaternion);
  return Math.min(...corners.map((corner) => corner.clone().applyQuaternion(q).z + pose.z));
}

function mix(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
    quaternion: new Quaternion().fromArray(a.quaternion).slerp(new Quaternion().fromArray(b.quaternion), t).toArray(),
  };
}

// Fixed-step rigid-body trajectory: gravity, corner contact impulses, friction and
// angular inertia. Precomputing keeps frame drops and blur samples deterministic.
export function createStickDrop(random = Math.random, start = REST_STICK) {
  const sign = random() < .5 ? -1 : 1;
  // Each release chooses its own heading around the original horizontal state,
  // rather than adding a rotation to the previous landing.
  const landingYaw = (random() * 2 - 1) * MAX_STICK_YAW;
  const rotation = new Euler((random() * .12 + .09) * sign, (random() * .14 + .11) * -sign, landingYaw, 'ZYX');
  const launch = { x: STICK.x, y: STICK.y, z: 132 + random() * 20, quaternion: new Quaternion().setFromEuler(rotation).toArray() };
  const position = new Vector3(launch.x, launch.y, launch.z);
  const orientation = new Quaternion().fromArray(launch.quaternion);
  const velocity = new Vector3(), omega = new Vector3(.25 * sign, -.2 * sign, 0);
  const momentum = omega.clone().applyQuaternion(orientation.clone().invert()).multiply(inertia).applyQuaternion(orientation);
  const frames = [launch], impacts = [];
  let quiet = 0;
  const snapshot = () => ({ x: position.x, y: position.y, z: position.z, quaternion: orientation.toArray() });
  const inverseInertia = (v) => v.clone().applyQuaternion(orientation.clone().invert()).divide(inertia).applyQuaternion(orientation);
  for (let step = 1; step <= 960; step++) {
    velocity.z -= GRAVITY * STEP;
    position.addScaledVector(velocity, STEP);
    omega.copy(inverseInertia(momentum));
    const spin = omega.length();
    if (spin > 0) orientation.premultiply(new Quaternion().setFromAxisAngle(omega.clone().divideScalar(spin), spin * STEP)).normalize();
    // Midpoint and in-plane heading are constrained; the ends can still rock,
    // collide and rebound in 3D. This prevents any accumulated lateral drift.
    const tilt = new Euler().setFromQuaternion(orientation, 'ZYX');
    orientation.setFromEuler(new Euler(tilt.x, tilt.y, landingYaw, 'ZYX'));
    const contacts = corners.map((corner) => corner.clone().applyQuaternion(orientation));
    const minimum = Math.min(...contacts.map((contact) => contact.z + position.z));
    const contact = minimum < .15;
    if (minimum < 0) position.z -= minimum;
    if (contact) {
      // Resolve the lowest end first, then the other contacting corners. A tilted
      // end redirects the impact into rotation, producing the second end strike.
      contacts.sort((a, b) => a.z - b.z);
      for (let iteration = 0; iteration < 6; iteration++) for (const arm of contacts) {
        if (arm.z + position.z > .2) continue;
        const contactVelocity = velocity.clone().add(omega.clone().cross(arm));
        if (contactVelocity.z >= 0) continue;
        const cross = new Vector3(arm.y, -arm.x, 0);
        const denominator = 1 + inverseInertia(cross).dot(cross);
        const restitution = iteration === 0 && contactVelocity.z < -65 ? .5 : 0;
        const impulse = -(1 + restitution) * contactVelocity.z / denominator;
        velocity.z += impulse;
        momentum.add(cross.multiplyScalar(impulse));
        omega.copy(inverseInertia(momentum));
        // Coulomb friction at the same corner damps lateral slip and rolling.
        const slip = velocity.clone().add(omega.clone().cross(arm)); slip.z = 0;
        const slipSpeed = slip.length();
        if (slipSpeed > .0001) {
          const tangent = slip.divideScalar(slipSpeed);
          const tangentArm = arm.clone().cross(tangent);
          const friction = Math.min(impulse * .55, slipSpeed / Math.max(.00001, inverseInertia(tangentArm).dot(tangentArm)));
          momentum.addScaledVector(tangentArm, -friction);
          omega.copy(inverseInertia(momentum));
        }
        if (restitution && (!impacts.length || step * STEP - impacts.at(-1).time > .02)) {
          impacts.push({ time: step * STEP, speed: -contactVelocity.z, end: Math.sign(arm.x) });
        }
      }
      // Contact damping dissipates the remaining rotational energy.
      momentum.multiplyScalar(.975); omega.copy(inverseInertia(momentum));
    }
    frames.push(snapshot());
    quiet = contact && velocity.length() < 6 && omega.length() < .08 ? quiet + STEP : 0;
    if (quiet > .16) break;
  }
  const final = frames.at(-1);
  // Contact tolerance leaves less than a fraction of a design pixel of movement.
  const settled = { ...final, x: STICK.x, y: STICK.y, z: STICK.thickness / 2, quaternion: new Quaternion().setFromEuler(new Euler(0, 0, landingYaw, 'ZYX')).toArray() };
  frames.push(settled);
  const duration = (PICKUP + (frames.length - 1) * STEP * 1000) / STICK_PLAYBACK_RATE;
  return {
    duration, impacts: impacts.map((impact) => ({ ...impact, time: impact.time / STICK_PLAYBACK_RATE })), settled,
    at(milliseconds) {
      milliseconds *= STICK_PLAYBACK_RATE;
      if (milliseconds <= 0) return start;
      if (milliseconds < PICKUP) return mix(start, launch, smooth(milliseconds / PICKUP));
      const frame = Math.max(0, (milliseconds - PICKUP) / (STEP * 1000));
      const index = Math.floor(frame);
      return index >= frames.length - 1 ? settled : mix(frames[index], frames[index + 1], frame - index);
    },
  };
}

export function stickMotionDistance(a, b) {
  const qa = new Quaternion().fromArray(a.quaternion), qb = new Quaternion().fromArray(b.quaternion);
  return Math.max(...corners.map((corner) => {
    const va = corner.clone().applyQuaternion(qa).add(new Vector3(a.x, a.y, a.z));
    const vb = corner.clone().applyQuaternion(qb).add(new Vector3(b.x, b.y, b.z));
    return Math.hypot(va.x - vb.x, va.y - vb.y);
  }));
}
