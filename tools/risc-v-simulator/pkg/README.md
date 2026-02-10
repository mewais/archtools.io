# RISC-V Functional Simulator

A high-performance, educational RISC-V simulator written in Rust with WebAssembly bindings for browser-based execution.

## Features

- **RV32I Base Instruction Set**: Complete implementation of the base integer instruction set
- **Memory Management**: Sparse page-based memory (4KB pages) for efficient simulation
- **Debugging Tools**: Breakpoints, watchpoints, execution history
- **WebAssembly Interface**: Full JavaScript API for browser integration
- **Educational Focus**: Student-friendly error messages and detailed state inspection
- **Extensible Architecture**: Modular design ready for additional RISC-V extensions

## Implemented Instructions (10 Base Instructions)

| Instruction | Type | Description |
|-------------|------|-------------|
| `ADD`       | R    | Add two registers |
| `ADDI`      | I    | Add immediate to register |
| `LW`        | I    | Load word from memory |
| `SW`        | S    | Store word to memory |
| `BEQ`       | B    | Branch if equal |
| `JAL`       | J    | Jump and link |
| `JALR`      | I    | Jump and link register |
| `LUI`       | U    | Load upper immediate |
| `AUIPC`     | U    | Add upper immediate to PC |
| `ECALL`     | -    | Environment call (system call) |

## Building

### Prerequisites

- Rust 2021 edition or later
- wasm-pack (for WebAssembly builds)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Add wasm32 target
rustup target add wasm32-unknown-unknown
```

### Build for WebAssembly

```bash
./build.sh
```

This generates WASM modules in `../../pkg/risc-v-simulator/`.

### Build for Native (Testing)

```bash
# Run tests
cargo test

# Run specific test
cargo test test_add

# Build native library
cargo build --release
```

## Usage

### JavaScript/TypeScript (Browser)

```javascript
import init, { RiscVSimulator } from './pkg/risc-v-simulator/risc_v_simulator.js';

// Initialize WASM module
await init();

// Create simulator
const sim = new RiscVSimulator();

// Load program (assembled binary)
const program = new Uint8Array([
    0x13, 0x00, 0x00, 0x00,  // addi x0, x0, 0 (NOP)
    0x93, 0x02, 0xA0, 0x00,  // addi x5, x0, 10
    0x13, 0x03, 0x50, 0x01,  // addi x6, x0, 21
    0xB3, 0x83, 0x62, 0x00,  // add x7, x5, x6
]);
sim.loadProgram(0x00000000, program);

// Set PC to start
sim.setPC(0x00000000);

// Execute instructions
try {
    sim.step();  // Execute one instruction
    console.log('PC:', sim.getPC().toString(16));
    console.log('x7:', sim.readRegister(7));
} catch (e) {
    console.error('Execution error:', e);
}

// Get all registers
const registers = sim.getAllRegisters();
console.log('Registers:', registers);

// Get memory pages
const pages = sim.getMemoryPages();
console.log('Memory pages:', pages);

// Set breakpoint
sim.setBreakpoint(0x00000008);

// Run until breakpoint
try {
    sim.run();
} catch (e) {
    console.log('Stopped:', e);
}

// Get execution statistics
console.log('Cycles:', sim.getCycles());
console.log('Instructions:', sim.getInstructionCount());
```

### API Reference

#### Execution Control
- `step()` - Execute single instruction
- `run()` - Run until breakpoint or halt
- `pause()` - Pause execution
- `reset()` - Reset simulator state

#### State Access
- `getPC()` - Get program counter
- `setPC(pc)` - Set program counter
- `readRegister(index)` - Read integer register
- `writeRegister(index, value)` - Write integer register
- `getAllRegisters()` - Get all registers as array
- `getState()` - Get complete CPU state snapshot

#### Memory Operations
- `loadProgram(addr, data)` - Load program into memory
- `readMemory(addr)` - Read byte from memory
- `writeMemory(addr, value)` - Write byte to memory
- `getMemoryPages()` - Get all allocated memory pages

#### Debugging
- `setBreakpoint(pc)` - Set breakpoint at PC
- `removeBreakpoint(pc)` - Remove breakpoint
- `clearBreakpoints()` - Clear all breakpoints
- `getBreakpoints()` - Get all breakpoint addresses
- `setWatchpoint(addr, type, size)` - Set memory watchpoint
- `removeWatchpoint(addr)` - Remove watchpoint
- `getHistory(count)` - Get last N execution history entries

#### Statistics
- `getCycles()` - Get cycle count
- `getInstructionCount()` - Get instructions retired

## Architecture

```
risc-v-simulator/
├── src/
│   ├── core/           # CPU state, memory, registers, executor
│   ├── isa/            # Instruction set architecture
│   │   ├── rv32i/      # RV32I base instructions
│   │   └── ...         # Future extensions (RV64I, M, A, F, D, C, V)
│   ├── debug/          # Breakpoints, watchpoints, history
│   ├── analysis/       # Stack frames, calling conventions
│   ├── performance/    # Cycle counting, dependency tracking
│   └── wasm/           # WebAssembly bindings
├── tests/              # Integration tests
└── benches/            # Performance benchmarks
```

## Design Principles

### Memory Safety
- Zero unsafe code in public API
- Memory-safe Rust throughout
- Comprehensive error handling with student-friendly messages

### Performance
- Sparse memory allocation (only touched pages)
- Zero-cost abstractions
- Optimized for size in WASM builds

### Educational Focus
- Clear, descriptive error messages
- Complete state inspection capabilities
- Execution history tracking
- Support for debugging tools

### Extensibility
- Trait-based instruction execution
- Hook system for performance modeling
- Pluggable memory implementations
- Modular ISA extensions

## Testing

```bash
# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test module
cargo test rv32i

# Run benchmarks
cargo bench
```

## Future Extensions

- **RV64I**: 64-bit integer instructions
- **M Extension**: Multiplication and division
- **A Extension**: Atomic operations
- **F Extension**: Single-precision floating-point
- **D Extension**: Double-precision floating-point
- **C Extension**: Compressed 16-bit instructions
- **V Extension**: Vector operations
- **Pipeline Simulation**: Cycle-accurate pipeline modeling
- **Cache Simulation**: Memory hierarchy modeling

## Contributing

This simulator is part of the Architect.io educational platform. Contributions should maintain:
- Educational clarity
- Memory safety
- Comprehensive testing
- Documentation

## License

MIT License - see LICENSE file for details

## References

- [RISC-V Specification](https://riscv.org/technical/specifications/)
- [RISC-V ISA Manual](https://github.com/riscv/riscv-isa-manual)
- [wasm-bindgen Documentation](https://rustwasm.github.io/wasm-bindgen/)
