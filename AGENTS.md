# CPU Flow-Trace

**From transistors to a 4-bit CPU.**

This repository is for an interactive educational website called **CPU Flow-Trace** (`cpu-flow-trace`). Its goal is to make the operation of a computer visible: start with simple electronic building blocks, connect them into progressively more complex circuits, and ultimately watch a **TD4-style 4-bit CPU** execute programs.

## What we want to build

The central experience is **watching signals flow through an actual connected circuit**, not just seeing abstract input/output values or register states change.

- Show the circuit's components and wires, with their current logical states (H/L) visible.
- When a signal changes, **animate the change traveling along the wire**, reaching downstream components, and triggering further changes. Do not make every wire switch color instantaneously at a clock edge.
- Let users slow down, pause, step through, and inspect these changes. A CPU clock cycle should be explorable at a finer scale than one instantaneous state transition.
- Allow users to zoom and inspect the displayed circuit. Dynamic expansion of modules into their internal circuits is not part of the current scope.
- Make it possible to understand *why* each change occurs, not merely observe that it happened.

The learning path should build toward the CPU in stages: transistors and simple switching circuits; logic gates; latches and flip-flops; adders, multiplexers, and registers; then the integrated TD4 CPU. The final experience should let users run small programs and observe their consequences through the circuitry, including the CPU's inputs and outputs.

## Modeling philosophy

We do **not** aim to reproduce the proprietary or exact internal transistor layouts of real logic ICs. Instead, construct **functionally equivalent circuits** from simpler components and compose them hierarchically. At the lowest useful level, transistors may be modeled as idealized switches; their semiconductor physics need not be simulated. Resistors and other simple elements may be represented schematically rather than modeled in full physical detail.

The simulation should capture **logical cause and effect over time** through connected components and wires. In the initial module-based visualization, modules have zero internal delay; elapsed propagation time comes from the wires between them. Wire propagation is a first-class part of the visualization: a transition should visibly move along a routed wire rather than recolor its entire length at once. This is an educational, time-resolved model, **not** a claim to simulate electromagnetic wave propagation, analog voltages, or physically exact delays. Keep that distinction clear to users.

The stages of the learning path should use consistent logical behavior and reusable circuit definitions where practical. Lower-level lesson circuits can explain how a module works without requiring its internals to be simulated in the main visualization. The CPU must still execute through the connected circuit model, rather than being a disconnected illustration driven by a separate scripted sequence.

## Current implementation direction

- **Build the main visualization from modules first.** Use modules such as NAND gates and DFFs directly in a fixed circuit composition. They may be simulation primitives; implementing or simulating their MOS internals is not a prerequisite.
- **Use zero internal module delay.** A module evaluates when a relevant input event arrives at its terminal, according to its logical behavior. A DFF captures data on its specified clock edge and otherwise retains its state. Resulting output changes immediately begin propagating along outgoing wires, which retain their modeled travel time.
- **Do not implement dynamic expansion or collapse of module internals.** Zooming and inspecting the fixed circuit remain useful, but switching abstraction levels within a running circuit is not a requirement.
- **Consider a fully MOS-expanded version later, if feasible.** Treat it as a separate, statically expanded version after the module-based experience works. It is an optional future direction, not a dependency of the initial CPU implementation, and does not require live switching between module and MOS representations.

## Experience and design priorities

- **Clarity first.** The flow of signals, the structure of a circuit, and the relationship between them should be immediately legible.
- **Explorable detail.** Users should be able to inspect individual components, wires, and intermediate states without losing sight of the larger circuit.
- **Progressive complexity.** Each stage should teach a concept that becomes part of the final CPU.
- **Interactive experimentation.** Let users change inputs, advance execution, and observe the results; program editing is desirable for the complete TD4 experience.
- **Faithful logic, approachable presentation.** Prefer a coherent, testable simulation with explicitly stated simplifications over visually impressive but misleading behavior.

## Guidance for contributors and coding agents

Treat the broad vision above as the product direction, **not a fixed technical specification**, while following the current implementation direction. Choose libraries, architecture, visual language, and implementation details based on what best supports the experience. Prefer small working demonstrations that can be extended into the full system. In particular, validate wire propagation, module connections, and stateful behavior early. Do not make dynamic hierarchy navigation or MOS expansion a prerequisite for progress.

When making trade-offs, prioritize the user's ability to trace **how a local electrical/logical change leads, step by step, to the behavior of an entire CPU**.

## References

### TD4 CPU

- [CPUの創りかた (How to Build a CPU)](https://book.mynavi.jp/ec/products/detail/id=22065) — The original book by Kaoru Tonami introducing the TD4 4-bit CPU.
- [TD4-4BIT-CPU](https://github.com/wuxx/TD4-4BIT-CPU) — TD4 hardware implementation, schematics, PCB designs, and documentation.
- [simpleTD4](https://github.com/asfdrwe/simpleTD4) — Verilog implementation of TD4, including its instruction set and example programs.
- [simpleTD4 Implementation Explained](https://qiita.com/asfdrwe/items/8dd955240b8291346384) — Japanese explanation of the Verilog implementation.
- [Implementation Example](https://xyama.sakura.ne.jp/hp/4bitCPU_TD4.html)
