# How a CPU Works

**Tracing signal flow through a small CPU.**

How does a collection of electronic components execute a program?

How a CPU Works is an interactive guide to that question. Follow signals along wires, see how one change causes the next, and build an understanding of a computer from simple switches to a TD4-style 4-bit CPU.

The site is available in **English and Japanese**.

## Explore the circuit

Change an input and watch its effect travel through the circuit. Slow down the animation, pause it, or advance to the next change to see why an output changes. Select a gate or wire to inspect its state, and zoom in for a closer look.

Signals use two colors throughout the site: **terracotta for H (1)** and **gray for L (0)**.

## From signals to programs

The circuit articles follow a path through four groups:

1. **Signals and logic** — wires, transistors as switches, and logic gates.
2. **Memory** — latches, clock edges, flip-flops, and registers.
3. **Arithmetic and control** — adders, multiplexers, the program counter, ROM, and instruction decoding.
4. **The complete CPU** — connecting the TD4 and tracing programs through its circuits.

Each article is planned around a question, an interactive circuit, a step-by-step explanation of signal changes, and the circuit’s role in the CPU.

## Try it today

The home page runs a connected TD4 CPU, with **MOS circuitry and power wires** shown by default.

- Choose Count up, Blinking LEDs, Input → output, or Ramen timer, or edit and apply your own assembly program.
- Run continuously or send one clock pulse. Pause propagation, advance to the next change, or step through observation time.
- Switch among blocks, modules, NAND, and MOS. MOS power wires can be shown or hidden. The block view outlines the CPU with a dashed boundary, leaving INPUT, OUTPUT, and ROM outside it.
- Select components or wires to inspect their values, connections, and travel time. Zoom up to 1200% on the CPU.
- Open any of nine independent module experiments, each with module, NAND, and both MOS views.

All circuit views use the 1.3-unit wire layout. Construction changes finish propagation and preserve ROM, input, held register values and instruction count, then restart observation time at zero. Toggling MOS power wires preserves the in-flight signals as well. The program table highlights the held PC address; the circuit ROM highlights the address that has arrived along the wires.

The 13 circuit articles remain in preparation. Their outlines are available from the circuit explanations index. The original experimental workbench remains available for comparison; the main site builds and runs independently of it.

## About the model

The simulation is designed to make logical cause and effect visible. Components respond when inputs arrive, and changes take time to travel along the displayed wires. These delays help you follow the sequence of events; they do not represent physically exact electrical propagation or analog voltages.

## Further reading

- 渡波 郁, [CPUの創りかた](https://book.mynavi.jp/ec/products/detail/id=22065) — the book introducing the TD4 CPU.
- 上原 周, [作ろう!CPU：基礎から理解するコンピューターのしくみ](https://ndlsearch.ndl.go.jp/books/R100000002-I030581135).

The blinking LED and ramen timer programs are based on the examples collected on [this TD4 implementation page](https://xyama.sakura.ne.jp/hp/4bitCPU_TD4.html).

## Run locally or contribute

See the [development guide](docs/development.md) for setup and build instructions, or the [contribution guide](docs/contributing.md) for adding circuits and articles.

Created by [Daichi Sasaki](https://d1ssk.github.io/).
