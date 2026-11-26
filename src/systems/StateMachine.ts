/**
 * A tiny, reusable Finite State Machine (FSM).
 *
 * An entity is always in exactly ONE state (e.g. "idle", "move", "attack").
 * Each state can define three optional hooks:
 *   enter()  - runs once when we switch INTO the state
 *   update() - runs every frame while we are in the state
 *   exit()   - runs once when we switch OUT of the state
 *
 * This keeps behavior code organized: instead of one giant update() full of
 * if/else checks, each state only handles what matters for that state.
 *
 * Usage:
 *   const fsm = new StateMachine<'idle' | 'move'>('idle', {
 *     idle: { update: () => { if (moving) fsm.set('move'); } },
 *     move: { enter: () => playWalk(), update: (dt) => walk(dt) },
 *   });
 *   fsm.update(dt); // call every frame
 */

export interface State {
  enter?: () => void;
  update?: (dt: number) => void;
  exit?: () => void;
  /** A terminal state can never be left (e.g. "dead"). Protects against bugs. */
  terminal?: boolean;
}

export class StateMachine<K extends string> {
  private current: K;
  private states: Record<K, State>;
  /** Seconds spent in the current state (handy for timed states like "attack"). */
  public time = 0;

  constructor(initial: K, states: Record<K, State>) {
    this.states = states;
    this.current = initial;
    this.states[initial].enter?.();
  }

  /** Name of the active state. */
  get state(): K {
    return this.current;
  }

  /** Switch to another state. Switching to the same state does nothing unless `force` is true. */
  set(next: K, force = false): void {
    if (this.states[this.current].terminal) return;
    if (next === this.current && !force) return;
    this.states[this.current].exit?.();
    this.current = next;
    this.time = 0;
    this.states[next].enter?.();
  }

  /** Call once per frame. `dt` is in seconds. */
  update(dt: number): void {
    this.time += dt;
    this.states[this.current].update?.(dt);
  }
}
