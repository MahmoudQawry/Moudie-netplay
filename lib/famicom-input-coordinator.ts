export type InputTransition<Button extends string> = {
  button: Button;
  isDown: boolean;
};

/**
 * React Native can end the first Pressable when a second finger starts on a
 * sibling button. In a Famicom game this breaks fundamental combinations such
 * as RIGHT + A/B. This coordinator keeps a direction logically held while an
 * action button is still held, then releases it when the action gesture ends.
 */
export class FamicomInputCoordinator<Button extends string> {
  private readonly physicalDown = new Set<Button>();
  private readonly logicalDown = new Set<Button>();
  private readonly pendingDirections = new Set<Button>();
  private readonly deferredDirections = new Set<Button>();

  constructor(
    private readonly directions: ReadonlySet<Button>,
    private readonly actions: ReadonlySet<Button>,
  ) {}

  transition(button: Button, isDown: boolean): InputTransition<Button>[] {
    if (isDown) return this.press(button);
    return this.release(button);
  }

  /**
   * Called after the very short Android responder hand-off window. A normal
   * finger lift releases a direction here; a jump button that arrived in the
   * same gesture keeps the direction down until the jump is released.
   */
  flushPendingDirections(): InputTransition<Button>[] {
    const transitions: InputTransition<Button>[] = [];
    for (const direction of this.pendingDirections) {
      if (this.hasActionHeld()) {
        this.deferredDirections.add(direction);
      } else if (this.logicalDown.delete(direction)) {
        transitions.push({ button: direction, isDown: false });
      }
    }
    this.pendingDirections.clear();
    return transitions;
  }

  private press(button: Button): InputTransition<Button>[] {
    if (this.physicalDown.has(button)) return [];
    if (this.directions.has(button) && this.pendingDirections.size) {
      // Changing direction is an intentional new movement, not a responder hand-off.
      const releases = this.flushPendingDirections();
      this.physicalDown.add(button);
      this.deferredDirections.delete(button);
      if (this.logicalDown.has(button)) return releases;
      this.logicalDown.add(button);
      return [...releases, { button, isDown: true }];
    }
    this.physicalDown.add(button);
    this.pendingDirections.delete(button);
    this.deferredDirections.delete(button);
    if (this.logicalDown.has(button)) return [];
    this.logicalDown.add(button);
    return [{ button, isDown: true }];
  }

  private release(button: Button): InputTransition<Button>[] {
    if (!this.physicalDown.delete(button) || !this.logicalDown.has(button)) return [];

    if (this.directions.has(button)) {
      this.pendingDirections.add(button);
      return [];
    }

    const transitions: InputTransition<Button>[] = [];
    this.logicalDown.delete(button);
    transitions.push({ button, isDown: false });

    if (this.actions.has(button) && !this.hasActionHeld()) {
      transitions.push(...this.flushPendingDirections());
      for (const direction of this.deferredDirections) {
        if (this.logicalDown.delete(direction)) transitions.push({ button: direction, isDown: false });
      }
      this.deferredDirections.clear();
    }
    return transitions;
  }

  private hasActionHeld() {
    for (const action of this.actions) if (this.physicalDown.has(action)) return true;
    return false;
  }
}
