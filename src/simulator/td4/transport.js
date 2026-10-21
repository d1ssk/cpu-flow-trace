
/* Educational wire transport; modules evaluate without internal delay. */
  const PROPAGATION_SPEED = 360;
  class Transport {
    send(id, value, onArrival) {
      const wire = this.wires[id];
      if (wire.source === value) return;
      wire.source = value;
      wire.transitions.push({ time: this.time, value });
      this.queue.push({ time: this.time + wire.delay, order: this.sequence++, action: () => {
        wire.arrived = value;
        onArrival(value);
      } });
      this.queue.sort((a, b) => a.time - b.time || a.order - b.order);
    }
    advance(delta) {
      if (!Number.isFinite(delta) || delta < 0) throw new Error('Invalid time step');
      const target = this.time + delta;
      while (this.queue.length && this.queue[0].time <= target) {
        this.time = this.queue[0].time;
        // Arrivals at the same modeled instant are evaluated together.
        const batch = [];
        while (this.queue.length && this.queue[0].time <= this.time + 1e-8) batch.push(this.queue.shift());
        for (const event of batch) event.action();
        this.flush?.();
      }
      this.time = target;
      for (const wire of Object.values(this.wires)) {
        while (wire.transitions.length && wire.transitions[0].time + wire.delay <= this.time) {
          wire.initial = wire.transitions.shift().value;
        }
      }
    }
    next() {
      if (!this.queue.length) return false;
      this.advance(this.queue[0].time - this.time);
      return true;
    }
    valueAt(id, fraction = 1) {
      const wire = this.wires[id];
      let value = wire.initial;
      for (const transition of wire.transitions) {
        if (this.time - transition.time >= wire.delay * fraction) value = transition.value;
      }
      return value;
    }
    get busy() { return this.queue.length > 0; }
  }
  const api = {Transport, PROPAGATION_SPEED};
  export default api;
