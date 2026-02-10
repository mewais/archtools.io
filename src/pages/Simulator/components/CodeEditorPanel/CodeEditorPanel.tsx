import React, { useRef, useState, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import ExpandablePanel from '../../../../components/ExpandablePanel';
import Button from '../../../../components/Button';
import Tooltip from '../../../../components/Tooltip';
import ISAVariantSelector from '../ISAVariantSelector';
import SamplePicker from './SamplePicker';
import { useSimulatorContext } from '../../contexts/SimulatorContext';
import { useLayout } from '../../contexts/LayoutContext';
import './CodeEditorPanel.css';

export interface CodeEditorPanelProps {
  className?: string;
}

/**
 * CodeEditorPanel - Monaco editor with RISC-V assembly support
 *
 * Features:
 * - Monaco editor integration with RISC-V syntax highlighting
 * - Breakpoint gutter (click to toggle)
 * - Current PC line highlighting
 * - Control buttons: Run, Step, Pause, Reset
 * - Load/save program files
 * - WASM simulator integration
 */
const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({ className = '' }) => {
  const { state, pc, run, step, pause, reset, toggleBreakpoint, breakpoints, loadProgramFromText, lineToAddress, addressToLine, simulator, lastStep, stepCount, assemblyErrors } = useSimulatorContext();
  const { minimizedPanels, expandedPanel, toggleMinimize, toggleExpand } = useLayout();
  const isMinimized = minimizedPanels.has('code-editor');
  const isExpanded = expandedPanel === 'code-editor';

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const [isEditorReady, setIsEditorReady] = useState<boolean>(false);

  // Use refs to always have fresh values in event handlers
  const breakpointsRef = useRef(breakpoints);
  const toggleBreakpointRef = useRef(toggleBreakpoint);
  const lineToAddressRef = useRef(lineToAddress);

  // Use ref for loadProgramFromText to avoid re-triggering effects
  const loadProgramRef = useRef(loadProgramFromText);

  // Update refs when values change
  useEffect(() => {
    breakpointsRef.current = breakpoints;
    toggleBreakpointRef.current = toggleBreakpoint;
    lineToAddressRef.current = lineToAddress;
    loadProgramRef.current = loadProgramFromText;
  }, [breakpoints, toggleBreakpoint, lineToAddress, loadProgramFromText]);

  const [code, setCode] = useState<string>('# RISC-V Assembly\n# Write your code here\n\n.text\n.globl main\nmain:\n    li a0, 10\n    li a1, 20\n    add a2, a0, a1\n    ret\n');
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return document.documentElement.getAttribute('data-theme') as 'light' | 'dark' || 'light';
  });
  const [isSamplePickerOpen, setIsSamplePickerOpen] = useState<boolean>(false);
  // Track whether program has been loaded/assembled (ref is source of truth, state is for React updates)
  const programLoadedRef = useRef(false);
  const [, setProgramLoaded] = useState<boolean>(false);
  const codeRef = useRef(code);
  const initialLoadDone = useRef(false);
  // Track when we're setting code programmatically (sample/file load) vs user typing
  const isProgrammaticCodeChange = useRef(false);
  // Track if we have a pending step after program load
  const pendingStepRef = useRef(false);

  // Keep code ref updated
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // Execute pending step when addressToLine becomes available after program load
  useEffect(() => {
    if (pendingStepRef.current && addressToLine.size > 0) {
      console.log('[Pending Step Effect] addressToLine now has entries, executing pending step');
      pendingStepRef.current = false;
      step();
    }
  }, [addressToLine, step]);

  // Note: We no longer reset programLoaded on code changes.
  // Instead, we only set it to false when user types in editor (handleCodeChange).
  // This prevents the race condition where loading a sample/file would reset the flag.

  // Load program when both simulator and editor are ready (on initial load)
  useEffect(() => {
    if (simulator && isEditorReady && !initialLoadDone.current) {
      console.log('Auto-loading program, simulator and editor ready');
      loadProgramFromText(code);
      programLoadedRef.current = true;
      setProgramLoaded(true);
      initialLoadDone.current = true;
    }
  }, [simulator, isEditorReady, loadProgramFromText, code]); // Run when simulator and editor are ready

  // Helper to set programLoaded (both state and ref)
  const setIsProgramLoaded = useCallback((loaded: boolean) => {
    programLoadedRef.current = loaded;
    setProgramLoaded(loaded);
  }, []);

  // Wrapper functions for running/stepping
  const handleRun = useCallback(() => {
    // Use ref for current value (not stale closure)
    if (!programLoadedRef.current) {
      loadProgramRef.current(codeRef.current);
      setIsProgramLoaded(true);
    }
    run();
  }, [run, setIsProgramLoaded]);

  const handleStep = useCallback(() => {
    console.log('[handleStep] programLoadedRef.current:', programLoadedRef.current);
    // Load program if not already loaded (use ref for current value)
    if (!programLoadedRef.current) {
      console.log('[handleStep] Program not loaded, loading first and setting pending step...');
      loadProgramRef.current(codeRef.current);
      setIsProgramLoaded(true);
      // Set pending step flag - the useEffect watching addressToLine will call step()
      // once the state updates have propagated
      pendingStepRef.current = true;
      return; // Don't call step() now, wait for state to update
    }
    console.log('[handleStep] Calling step()');
    step();
  }, [step, setIsProgramLoaded]);

  // Wrapper for reset - reloads the program from current code
  const handleReset = useCallback(() => {
    reset();
    // Reload program after reset so instruction 1 is highlighted
    loadProgramRef.current(codeRef.current);
    setIsProgramLoaded(true);
  }, [reset, setIsProgramLoaded]);

  // Handler for sample selection - sets code AND loads program immediately
  // NOTE: We don't check simulator here because loadProgramFromText uses
  // simulatorRef.current internally, which is always up-to-date even after
  // setISAVariant() (before React re-renders).
  const handleSelectSample = useCallback((sampleCode: string) => {
    // Mark as programmatic change so handleCodeChange doesn't reset programLoaded
    isProgrammaticCodeChange.current = true;
    setCode(sampleCode);
    // Load the new sample immediately so it's highlighted
    // loadProgramFromText uses simulatorRef internally, so it will work
    // even if this component's simulator prop is stale after ISA upgrade
    loadProgramFromText(sampleCode);
    setIsProgramLoaded(true);
    // Reset flag after a microtask to allow Monaco onChange to fire first
    queueMicrotask(() => {
      isProgrammaticCodeChange.current = false;
    });
  }, [loadProgramFromText, setIsProgramLoaded]);

  // Handle editor mount
  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsEditorReady(true);

    // Set initial theme based on current theme
    const initialTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' || 'light';
    setCurrentTheme(initialTheme);

    // Register RISC-V language (simplified)
    monaco.languages.register({ id: 'riscv' });

    // RISC-V syntax highlighting
    monaco.languages.setMonarchTokensProvider('riscv', {
      tokenizer: {
        root: [
          // Comments
          [/#.*$/, 'comment'],

          // Directives
          [/\.(text|data|bss|section|globl|align|ascii|asciiz|byte|half|word|dword|float|double|space)/, 'keyword'],

          // Instructions - RV32I/RV64I base
          [/\b(add|addi|sub|subi|mul|div|rem|and|andi|or|ori|xor|xori|sll|slli|srl|srli|sra|srai)\b/, 'keyword'],
          [/\b(lw|lh|lb|lwu|lhu|lbu|sw|sh|sb|ld|sd)\b/, 'keyword'],
          [/\b(beq|bne|blt|bge|bltu|bgeu|jal|jalr|ret|call)\b/, 'keyword'],
          [/\b(li|la|mv|not|neg|j|jr)\b/, 'keyword'],
          [/\b(ecall|ebreak|fence|fence\.i)\b/, 'keyword'],
          // RVM extension (multiply/divide)
          [/\b(mulh|mulhsu|mulhu|divu|remu|mulw|divw|divuw|remw|remuw)\b/, 'keyword'],
          // RVA extension (atomics)
          [/\b(lr\.w|sc\.w|amoswap\.w|amoadd\.w|amoxor\.w|amoand\.w|amoor\.w|amomin\.w|amomax\.w|amominu\.w|amomaxu\.w)\b/, 'keyword'],
          [/\b(lr\.d|sc\.d|amoswap\.d|amoadd\.d|amoxor\.d|amoand\.d|amoor\.d|amomin\.d|amomax\.d|amominu\.d|amomaxu\.d)\b/, 'keyword'],
          // RVF extension (single-precision floating-point)
          [/\b(flw|fsw|fmadd\.s|fmsub\.s|fnmsub\.s|fnmadd\.s|fadd\.s|fsub\.s|fmul\.s|fdiv\.s|fsqrt\.s)\b/, 'keyword'],
          [/\b(fsgnj\.s|fsgnjn\.s|fsgnjx\.s|fmin\.s|fmax\.s|fcvt\.w\.s|fcvt\.wu\.s|fmv\.x\.w|feq\.s|flt\.s|fle\.s)\b/, 'keyword'],
          [/\b(fclass\.s|fcvt\.s\.w|fcvt\.s\.wu|fmv\.w\.x|fcvt\.l\.s|fcvt\.lu\.s|fcvt\.s\.l|fcvt\.s\.lu)\b/, 'keyword'],
          // RVD extension (double-precision floating-point)
          [/\b(fld|fsd|fmadd\.d|fmsub\.d|fnmsub\.d|fnmadd\.d|fadd\.d|fsub\.d|fmul\.d|fdiv\.d|fsqrt\.d)\b/, 'keyword'],
          [/\b(fsgnj\.d|fsgnjn\.d|fsgnjx\.d|fmin\.d|fmax\.d|fcvt\.s\.d|fcvt\.d\.s|feq\.d|flt\.d|fle\.d)\b/, 'keyword'],
          [/\b(fclass\.d|fcvt\.w\.d|fcvt\.wu\.d|fcvt\.d\.w|fcvt\.d\.wu|fcvt\.l\.d|fcvt\.lu\.d|fcvt\.d\.l|fcvt\.d\.lu)\b/, 'keyword'],
          [/\b(fmv\.x\.d|fmv\.d\.x)\b/, 'keyword'],
          // CSR instructions and pseudo-instructions
          [/\b(csrrw|csrrs|csrrc|csrrwi|csrrsi|csrrci)\b/, 'keyword'],
          [/\b(csrr|csrw|csrs|csrc|csrwi|csrsi|csrci)\b/, 'keyword'],
          [/\b(frcsr|fscsr|frrm|fsrm|frflags|fsflags)\b/, 'keyword'],

          // Registers - integer
          [/\b(zero|ra|sp|gp|tp|fp)\b/, 'variable.predefined'],
          [/\b(t[0-6]|s[0-9]|s1[01]|a[0-7])\b/, 'variable.predefined'],
          [/\bx([0-9]|[12][0-9]|3[01])\b/, 'variable.predefined'],
          // Registers - floating-point (numeric and ABI names)
          [/\bf([0-9]|[12][0-9]|3[01])\b/, 'variable.predefined'],
          [/\b(ft[0-9]|ft1[01]|fs[0-9]|fs1[01]|fa[0-7])\b/, 'variable.predefined'],

          // Numbers
          [/-?0x[0-9a-fA-F]+/, 'number.hex'],
          [/-?0b[01]+/, 'number.binary'],
          [/-?\d+/, 'number'],

          // Labels
          [/^[a-zA-Z_][a-zA-Z0-9_]*:/, 'type'],

          // Strings
          [/"([^"\\]|\\.)*"/, 'string'],
        ],
      },
    });

    // Configure dark theme
    monaco.editor.defineTheme('riscv-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955' },
        { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
        { token: 'variable.predefined', foreground: '4EC9B0' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'number.hex', foreground: 'B5CEA8' },
        { token: 'number.binary', foreground: 'B5CEA8' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'type', foreground: '4FC1FF', fontStyle: 'bold' },
      ],
      colors: {
        'editor.background': '#0f172a',
        'editor.foreground': '#f1f5f9',
      },
    });

    // Configure light theme
    monaco.editor.defineTheme('riscv-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '008000' },
        { token: 'keyword', foreground: '0000FF', fontStyle: 'bold' },
        { token: 'variable.predefined', foreground: '098658' },
        { token: 'number', foreground: '098658' },
        { token: 'number.hex', foreground: '098658' },
        { token: 'number.binary', foreground: '098658' },
        { token: 'string', foreground: 'A31515' },
        { token: 'type', foreground: '267f99', fontStyle: 'bold' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#111827',
      },
    });

    // Set up breakpoint gutter - click handler
    editor.onMouseDown((e) => {
      const targetType = e.target.type;

      // Allow clicking on glyph margin or line numbers to toggle breakpoints
      if (targetType === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
          targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber) {
          // Use lineToAddress mapping to get the actual memory address for this source line
          const address = lineToAddressRef.current.get(lineNumber);
          if (!address) {
            console.log(`No instruction at line ${lineNumber}`);
            return; // No instruction on this line
          }
          const exists = breakpointsRef.current.has(address);
          console.log(`Toggling breakpoint at line ${lineNumber}, address 0x${address.toString(16)}, exists: ${exists}, total breakpoints: ${breakpointsRef.current.size}`);
          console.log('All breakpoints:', Array.from(breakpointsRef.current.keys()).map(k => '0x' + k.toString(16)));
          toggleBreakpointRef.current(address);
        }
      }
    });

    // Apply theme immediately after mount
    monaco.editor.setTheme(initialTheme === 'dark' ? 'riscv-dark' : 'riscv-light');
  };

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          const newTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' || 'light';
          setCurrentTheme(newTheme);
          if (monacoRef.current) {
            monacoRef.current.editor.setTheme(newTheme === 'dark' ? 'riscv-dark' : 'riscv-light');
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  // Update breakpoint decorations
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const decorations: editor.IModelDeltaDecoration[] = [];
    const monaco = monacoRef.current;

    // Debug logging
    console.log('[Decoration Effect] Running, pc=', pc.toString(), 'typeof pc=', typeof pc, 'addressToLine.size=', addressToLine.size);

    // Add breakpoint decorations using addressToLine mapping
    breakpoints.forEach((bp, address) => {
      if (bp.enabled) {
        const lineNumber = addressToLine.get(address);
        if (lineNumber) {
          decorations.push({
            range: new monaco.Range(lineNumber, 1, lineNumber, 1),
            options: {
              isWholeLine: false,
              glyphMarginClassName: 'code-editor-breakpoint',
              glyphMarginHoverMessage: { value: 'Breakpoint (click to remove)' },
            },
          });
        }
      }
    });

    // Add current PC decoration using addressToLine mapping
    // Only show PC decoration if we have a valid mapping (program loaded)
    const pcLine = addressToLine.get(pc);
    console.log('[Decoration Effect] pcLine for pc=', pc.toString(), 'is', pcLine);
    if (pcLine !== undefined) {
      decorations.push({
        range: new monaco.Range(pcLine, 1, pcLine, 1),
        options: {
          isWholeLine: true,
          className: 'code-editor-current-line',
          glyphMarginClassName: 'code-editor-current-line-glyph',
        },
      });
      console.log('[Decoration Effect] Added PC decoration for line', pcLine);
    } else {
      console.log('[Decoration Effect] No line found for pc=', pc.toString());
      // Debug: log all keys in addressToLine
      const keys = Array.from(addressToLine.keys());
      console.log('[Decoration Effect] addressToLine keys:', keys.map(k => k.toString()));
    }

    // Apply decorations and store the IDs
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, decorations);
    console.log('[Decoration Effect] Applied', decorations.length, 'decorations');
  // Note: We include lastStep and stepCount in dependencies to force re-render after each step.
  // stepCount is incremented every time step() is called, guaranteeing this effect re-runs.
  }, [breakpoints, pc, addressToLine, isEditorReady, lastStep, stepCount]);

  // Handle code changes from user typing in editor
  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      // When user types, mark the program as needing reload
      // This doesn't apply to sample/file loading (detected via isProgrammaticCodeChange)
      if (!isProgrammaticCodeChange.current) {
        programLoadedRef.current = false;
        setProgramLoaded(false);
      }
    }
  };

  // Load file
  const handleLoadFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.s,.asm,.riscv';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          // Use handleSelectSample to set code AND load program
          handleSelectSample(text);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [handleSelectSample]);

  // Save file
  const handleSaveFile = useCallback(() => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.s';
    a.click();
    URL.revokeObjectURL(url);
  }, [code]);

  // Control button states
  const isRunning = state === 'running';

  return (
    <ExpandablePanel
      title="Code Editor"
      showTitle={false}
      isExpanded={isExpanded}
      isMinimized={isMinimized}
      onToggleExpand={() => toggleExpand('code-editor')}
      onToggleMinimize={() => toggleMinimize('code-editor')}
      className={`code-editor-panel ${className}`}
      headerActions={
        <div className="code-editor-panel__controls">
          <Tooltip content="Run program (F5)" position="bottom">
            <Button
              variant="primary"
              size="sm"
              onClick={handleRun}
              disabled={isRunning}
              aria-label="Run (F5)"
            >
              ▶
            </Button>
          </Tooltip>
          <Tooltip content="Step forward (F10)" position="bottom">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleStep}
              disabled={isRunning}
              aria-label="Step (F10)"
            >
              ⏩
            </Button>
          </Tooltip>
          <Tooltip content="Pause execution (F6)" position="bottom">
            <Button
              variant="secondary"
              size="sm"
              onClick={pause}
              disabled={!isRunning}
              aria-label="Pause (F6)"
            >
              ⏸
            </Button>
          </Tooltip>
          <Tooltip content="Reset simulator (Ctrl+R)" position="bottom">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              aria-label="Reset (Ctrl+R)"
            >
              ⟲
            </Button>
          </Tooltip>
          <div className="code-editor-panel__divider" />
          <Tooltip content="Load sample program" position="bottom">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSamplePickerOpen(true)}
              aria-label="Load sample program"
            >
              📚
            </Button>
          </Tooltip>
          <Tooltip content="Load assembly file" position="bottom">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadFile}
              aria-label="Load file"
            >
              📁
            </Button>
          </Tooltip>
          <Tooltip content="Save assembly file" position="bottom">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveFile}
              aria-label="Save file"
            >
              💾
            </Button>
          </Tooltip>
          <div className="code-editor-panel__divider" />
          <ISAVariantSelector />
        </div>
      }
    >
      {/* Assembly errors display */}
      {assemblyErrors.length > 0 && (
        <div className="code-editor-panel__errors">
          <div className="code-editor-panel__errors-header">
            ⚠ Assembly Errors ({assemblyErrors.length})
          </div>
          <div className="code-editor-panel__errors-list">
            {assemblyErrors.map((error, index) => (
              <div key={index} className="code-editor-panel__error-item">
                {error}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="code-editor-panel__editor">
        <Editor
          height="100%"
          language="riscv"
          theme={currentTheme === 'dark' ? 'riscv-dark' : 'riscv-light'}
          value={code}
          onChange={handleCodeChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            glyphMargin: true,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 4,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontSize: 14,
            fontFamily: 'var(--font-code)',
            tabSize: 4,
            insertSpaces: true,
            renderWhitespace: 'selection',
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
            },
          }}
        />
      </div>

      {/* Sample Picker Modal */}
      <SamplePicker
        isOpen={isSamplePickerOpen}
        onClose={() => setIsSamplePickerOpen(false)}
        onSelectSample={handleSelectSample}
      />
    </ExpandablePanel>
  );
};

export default CodeEditorPanel;
