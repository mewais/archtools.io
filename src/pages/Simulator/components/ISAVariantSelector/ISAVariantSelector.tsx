import React, { useState, useMemo, useCallback } from 'react';
import { useSimulatorContext } from '../../contexts/SimulatorContext';
import {
  type BaseISA,
  type Extension,
  type ExtensionCategory,
  type VectorConfig,
  EXTENSION_INFO,
  DEFAULT_VECTOR_CONFIG,
  getExtensionsByCategory,
  validateExtensions,
  getAllDependencies,
  getDependentExtensions,
  getTotalInstructionCount,
  formatISAVariant,
} from '../../types/ISAVariant';
import './ISAVariantSelector.css';

// Bundle component definitions
const G_COMPONENTS: Extension[] = ['M', 'A', 'F', 'D', 'Zicsr', 'Zifencei'];
const B_COMPONENTS: Extension[] = ['Zba', 'Zbb', 'Zbc', 'Zbs'];

// Tree rendering levels
const TREE_LEVEL = {
  ROOT: 0,
  CHILD: 1,
  GRANDCHILD: 2,
} as const;

export interface ISAVariantSelectorProps {
  className?: string;
}

/**
 * ISA Variant Selector Component
 *
 * Compact trigger button + modal for custom ISA configuration
 */
const ISAVariantSelector: React.FC<ISAVariantSelectorProps> = ({ className = '' }) => {
  const { isaVariant, setISAVariant, state } = useSimulatorContext();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customBase, setCustomBase] = useState<BaseISA>(isaVariant.base);
  const [customExtensions, setCustomExtensions] = useState<Set<Extension>>(
    new Set(isaVariant.extensions)
  );
  const [vectorConfig, setVectorConfig] = useState<VectorConfig>(
    isaVariant.vectorConfig || DEFAULT_VECTOR_CONFIG
  );
  const [confirmDisable, setConfirmDisable] = useState<{ext: Extension, dependents: Extension[]} | null>(null);
  const [confirmBreakG, setConfirmBreakG] = useState<Extension | null>(null);
  const [suggestEnableG, setSuggestEnableG] = useState(false);

  const isDisabled = state === 'running';
  const currentLabel = formatISAVariant(isaVariant);

  // Validation
  const validationResult = useMemo(() => {
    return validateExtensions(Array.from(customExtensions));
  }, [customExtensions]);

  // Categories to display
  const categories: { key: ExtensionCategory; title: string }[] = [
    { key: 'core', title: 'CORE EXTENSIONS' },
    { key: 'floating-point', title: 'FLOATING-POINT EXTENSIONS' },
    { key: 'vector', title: 'VECTOR EXTENSION' },
    { key: 'bit-manipulation', title: 'BIT MANIPULATION' },
    { key: 'system', title: 'SYSTEM EXTENSIONS' },
  ];

  // Handle extension toggle
  const handleExtensionToggle = useCallback((ext: Extension) => {
    const newExtensions = new Set(customExtensions);

    if (newExtensions.has(ext)) {
      // Trying to disable
      if (ext === 'G') {
        // Disabling G - ask about components
        const enabledComponents = G_COMPONENTS.filter(c => newExtensions.has(c));
        if (enabledComponents.length > 0) {
          setConfirmDisable({ ext, dependents: enabledComponents });
          return;
        }
      } else if (ext === 'B') {
        // Disabling B - ask about components
        const enabledComponents = B_COMPONENTS.filter(c => newExtensions.has(c));
        if (enabledComponents.length > 0) {
          setConfirmDisable({ ext, dependents: enabledComponents });
          return;
        }
      } else if (G_COMPONENTS.includes(ext) && newExtensions.has('G')) {
        // Removing a G component while G is enabled - warn and break G
        setConfirmBreakG(ext);
        return;
      } else if (B_COMPONENTS.includes(ext) && newExtensions.has('B')) {
        // Removing a B component while B is enabled - warn and break B
        setConfirmBreakG(ext);
        return;
      } else {
        // Check for dependents
        const dependents = getDependentExtensions(ext).filter(d => newExtensions.has(d));
        if (dependents.length > 0) {
          setConfirmDisable({ ext, dependents });
          return;
        }
      }
      newExtensions.delete(ext);
    } else {
      // Enabling
      if (ext === 'G') {
        // Enabling G - auto-enable M, A, F, D, Zicsr, Zifencei
        newExtensions.add('G');
        G_COMPONENTS.forEach(c => {
          newExtensions.add(c);
          // Auto-enable dependencies
          const deps = getAllDependencies(c);
          deps.forEach(d => newExtensions.add(d));
        });
      } else if (ext === 'B') {
        // Enabling B - auto-enable Zba, Zbb, Zbc, Zbs
        newExtensions.add('B');
        B_COMPONENTS.forEach(c => newExtensions.add(c));
      } else {
        // Normal extension - auto-enable dependencies
        const deps = getAllDependencies(ext);
        deps.forEach(d => newExtensions.add(d));
        newExtensions.add(ext);

        // Check if all G or B components are now selected
        if (G_COMPONENTS.includes(ext) && !newExtensions.has('G')) {
          const allGComponentsSelected = G_COMPONENTS.every(c => newExtensions.has(c));
          if (allGComponentsSelected) {
            setSuggestEnableG(true);
          }
        }
        if (B_COMPONENTS.includes(ext) && !newExtensions.has('B')) {
          const allBComponentsSelected = B_COMPONENTS.every(c => newExtensions.has(c));
          if (allBComponentsSelected) {
            setSuggestEnableG(true); // Reuse the same modal
          }
        }
      }
    }

    setCustomExtensions(newExtensions);
  }, [customExtensions]);

  // Confirm disable with cascade
  const handleConfirmDisable = useCallback(() => {
    if (!confirmDisable) return;

    const newExtensions = new Set(customExtensions);
    newExtensions.delete(confirmDisable.ext);
    confirmDisable.dependents.forEach(d => newExtensions.delete(d));

    setCustomExtensions(newExtensions);
    setConfirmDisable(null);
  }, [confirmDisable, customExtensions]);

  // Confirm breaking G bundle
  const handleConfirmBreakG = useCallback(() => {
    if (!confirmBreakG) return;

    const newExtensions = new Set(customExtensions);
    newExtensions.delete(confirmBreakG); // Remove the extension user wanted to remove
    newExtensions.delete('G'); // Remove G since bundle is broken
    // Keep other G components selected

    setCustomExtensions(newExtensions);
    setConfirmBreakG(null);
  }, [confirmBreakG, customExtensions]);

  // Enable G when all components selected
  const handleEnableG = useCallback(() => {
    const newExtensions = new Set(customExtensions);
    newExtensions.add('G');
    setCustomExtensions(newExtensions);
    setSuggestEnableG(false);
  }, [customExtensions]);

  // Keep individual selection (don't enable G)
  const handleKeepIndividual = useCallback(() => {
    setSuggestEnableG(false);
  }, []);

  // Handle base change
  const handleBaseChange = (base: BaseISA) => {
    setCustomBase(base);
  };

  // Apply changes
  const handleApply = () => {
    if (validationResult.valid) {
      setISAVariant({
        base: customBase,
        extensions: Array.from(customExtensions),
        vectorConfig: customExtensions.has('V') ? vectorConfig : undefined,
      });
      setIsModalOpen(false);
    }
  };

  // Cancel
  const handleCancel = () => {
    setCustomBase(isaVariant.base);
    setCustomExtensions(new Set(isaVariant.extensions));
    setVectorConfig(isaVariant.vectorConfig || DEFAULT_VECTOR_CONFIG);
    setIsModalOpen(false);
  };

  // Check if extension is enabled
  const isExtensionEnabled = (ext: Extension): boolean => {
    const deps = getAllDependencies(ext);
    return deps.every(d => customExtensions.has(d));
  };

  // Get instruction count for extension
  const getInstructionCount = (ext: Extension): number => {
    const info = EXTENSION_INFO[ext];
    return customBase === 'RV32I' ? (info.instructionCount.rv32 || 0) : (info.instructionCount.rv64 || 0);
  };

  // Render extension checkbox
  const renderExtensionCheckbox = (
    ext: Extension,
    level: number = TREE_LEVEL.ROOT,
    isLast: boolean = false,
    hasParentSiblings: boolean = false
  ) => {
    const info = EXTENSION_INFO[ext];
    const isChecked = customExtensions.has(ext);
    const isEnabled = level === TREE_LEVEL.ROOT || isExtensionEnabled(ext);
    const instCount = getInstructionCount(ext);
    const { viaG, viaB } = isEnabledViaBundle(ext);

    // Determine tree connector class
    let treeClass = '';
    if (level === TREE_LEVEL.CHILD) {
      treeClass = isLast ? 'isa-ext-checkbox--tree-last' : 'isa-ext-checkbox--tree-middle';
    } else if (level === TREE_LEVEL.GRANDCHILD) {
      if (hasParentSiblings) {
        treeClass = isLast ? 'isa-ext-checkbox--tree-nested-last' : 'isa-ext-checkbox--tree-nested-middle';
      } else {
        treeClass = isLast ? 'isa-ext-checkbox--tree-last' : 'isa-ext-checkbox--tree-middle';
      }
    }

    const tooltip = ext === 'G'
      ? 'General: Automatically enables M, A, F, D, Zicsr, and Zifencei'
      : ext === 'B'
      ? 'Bit Manipulation: Automatically enables Zba, Zbb, Zbc, and Zbs'
      : ext === 'V'
      ? 'Vector: Configure VLEN and ELEN below when enabled'
      : undefined;

    return (
      <React.Fragment key={ext}>
        <div
          className={`isa-ext-checkbox isa-ext-checkbox--level-${level} ${treeClass} ${!isEnabled ? 'isa-ext-checkbox--disabled' : ''}`}
          title={tooltip}
        >
          <input
            type="checkbox"
            id={`ext-${ext}`}
            className="isa-ext-checkbox__input"
            checked={isChecked}
            disabled={!isEnabled}
            onChange={() => handleExtensionToggle(ext)}
          />
          <label htmlFor={`ext-${ext}`} className="isa-ext-checkbox__label">
            <div className="isa-ext-checkbox__name">
              {ext} - {info.name}
              {viaG && <span className="isa-ext-checkbox__badge">via G</span>}
              {viaB && <span className="isa-ext-checkbox__badge">via B</span>}
            </div>
            <div className="isa-ext-checkbox__count">
              ({instCount} inst)
            </div>
          </label>
        </div>

        {/* Inline vector configuration when V extension is checked */}
        {ext === 'V' && customExtensions.has('V') && (
          <div className="isa-vector-config isa-vector-config--inline">
            <div className="isa-vector-config__title">Vector Configuration</div>

            <div className="isa-vector-config__group">
              <label className="isa-vector-config__label">
                VLEN (Vector Register Length):
              </label>
              <div className="isa-vector-config__options">
                {([128, 256, 512, 1024] as const).map(vlen => (
                  <label
                    key={vlen}
                    className={`isa-vector-config__option ${vectorConfig.VLEN === vlen ? 'isa-vector-config__option--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="vlen"
                      value={vlen}
                      checked={vectorConfig.VLEN === vlen}
                      onChange={() => setVectorConfig({...vectorConfig, VLEN: vlen})}
                    />
                    <span className="isa-vector-config__option-label">{vlen} bits</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="isa-vector-config__group">
              <label className="isa-vector-config__label">
                ELEN (Maximum Element Width):
              </label>
              <div className="isa-vector-config__options">
                {([32, 64] as const).map(elen => (
                  <label
                    key={elen}
                    className={`isa-vector-config__option ${vectorConfig.ELEN === elen ? 'isa-vector-config__option--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="elen"
                      value={elen}
                      checked={vectorConfig.ELEN === elen}
                      onChange={() => setVectorConfig({...vectorConfig, ELEN: elen})}
                    />
                    <span className="isa-vector-config__option-label">{elen} bits</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="isa-vector-config__info">
              Hardware parameters - cannot be changed at runtime. SEW, LMUL, and vl are controlled via CSR instructions.
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  // Check if extension is enabled via G or B
  const isEnabledViaBundle = useCallback((ext: Extension): { viaG: boolean; viaB: boolean } => {
    const viaG = customExtensions.has('G') && G_COMPONENTS.includes(ext) && customExtensions.has(ext);
    const viaB = customExtensions.has('B') && B_COMPONENTS.includes(ext) && customExtensions.has(ext);
    return { viaG, viaB };
  }, [customExtensions]);

  // Render category with extensions
  const renderCategory = (category: ExtensionCategory, title: string) => {
    const extensions = getExtensionsByCategory(category);
    if (extensions.length === 0) return null;

    return (
      <div key={category} className="isa-category">
        <div className="isa-category__title">{title}</div>
        <div className="isa-category__extensions">
          {extensions.map(ext => {
            const info = EXTENSION_INFO[ext];

            // Skip M and A in Core category - they're rendered as children of G
            if (category === 'core' && (ext === 'M' || ext === 'A')) {
              return null;
            }

            // Skip Zb* extensions in Bit Manipulation category - they're rendered as children of B
            if (category === 'bit-manipulation' && B_COMPONENTS.includes(ext)) {
              return null;
            }

            // Render with dependency tree
            if (info.dependencies.length === 0) {
              // Special cases for bundle extensions
              let children: Extension[] = [];
              if (ext === 'G' && category === 'core') {
                // G renders M and A as children in Core category
                children = ['M', 'A'];
              } else if (ext === 'B' && category === 'bit-manipulation') {
                // B renders all Zb* extensions as children
                children = B_COMPONENTS;
              } else {
                // Get children that belong to this category only (no cross-category rendering)
                children = getDependentExtensions(ext)
                  .filter(d => {
                    const depInfo = EXTENSION_INFO[d];
                    return depInfo.category === category && depInfo.dependencies.length === 1;
                  });
              }

              return (
                <React.Fragment key={ext}>
                  {renderExtensionCheckbox(ext, TREE_LEVEL.ROOT)}
                  {/* Render children */}
                  {children.map((child, childIndex) => {
                    const isLastChild = childIndex === children.length - 1;

                    // Get grandchildren that belong to this category
                    const grandchildren = getDependentExtensions(child)
                      .filter(gc => {
                        const gcInfo = EXTENSION_INFO[gc];
                        return gcInfo.category === category && gcInfo.dependencies.length > 0;
                      });

                    return (
                      <React.Fragment key={child}>
                        {renderExtensionCheckbox(child, TREE_LEVEL.CHILD, isLastChild)}
                        {/* Render grandchildren */}
                        {grandchildren.map((grandchild, gcIndex) => {
                          const isLastGrandchild = gcIndex === grandchildren.length - 1;
                          return renderExtensionCheckbox(grandchild, TREE_LEVEL.GRANDCHILD, isLastGrandchild, !isLastChild);
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            }
            return null;
          })}
        </div>
      </div>
    );
  };

  // Total instruction count
  const totalInstructions = useMemo(() => {
    return getTotalInstructionCount({ base: customBase, extensions: Array.from(customExtensions) });
  }, [customBase, customExtensions]);

  return (
    <>
      {/* Compact Trigger Button */}
      <button
        className={`isa-trigger ${className}`}
        onClick={() => setIsModalOpen(true)}
        disabled={isDisabled}
        aria-label={`Configure ISA variant. Current: ${currentLabel}`}
      >
        <span className="isa-trigger__label">{currentLabel}</span>
        <span className="isa-trigger__icon">{isDisabled ? '\uD83D\uDD12' : '\u2699'}</span>
      </button>

      {/* Configuration Modal */}
      {isModalOpen && (
        <div className="isa-modal-backdrop" onClick={handleCancel}>
          <div className="isa-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="isa-modal__header">
              <h2 className="isa-modal__title">Configure ISA Variant</h2>
              <button
                className="isa-modal__close"
                onClick={handleCancel}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="isa-modal__content">
              {/* Base ISA Selection */}
              <div className="isa-section">
                <div className="isa-section__title">BASE ISA (Required)</div>
                <div className="isa-base-options">
                  <label className={`isa-base-option ${customBase === 'RV32I' ? 'isa-base-option--selected' : ''}`}>
                    <input
                      type="radio"
                      name="base-isa"
                      value="RV32I"
                      checked={customBase === 'RV32I'}
                      onChange={() => handleBaseChange('RV32I')}
                    />
                    <div className="isa-base-option__content">
                      <div className="isa-base-option__name">RV32I</div>
                      <div className="isa-base-option__desc">32-bit base</div>
                    </div>
                  </label>
                  <label className={`isa-base-option ${customBase === 'RV64I' ? 'isa-base-option--selected' : ''}`}>
                    <input
                      type="radio"
                      name="base-isa"
                      value="RV64I"
                      checked={customBase === 'RV64I'}
                      onChange={() => handleBaseChange('RV64I')}
                    />
                    <div className="isa-base-option__content">
                      <div className="isa-base-option__name">RV64I</div>
                      <div className="isa-base-option__desc">64-bit base</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Extension Categories */}
              {categories.map(cat => renderCategory(cat.key, cat.title))}

              {/* Configuration Summary */}
              <div className="isa-summary">
                <div className="isa-summary__title">CONFIGURATION SUMMARY</div>
                <div className="isa-summary__content">
                  <div className="isa-summary__row">
                    <span className="isa-summary__label">Base:</span>
                    <span className="isa-summary__value">
                      {customBase} ({customBase === 'RV32I' ? '32' : '64'}-bit registers)
                    </span>
                  </div>
                  <div className="isa-summary__row">
                    <span className="isa-summary__label">Extensions:</span>
                    <span className="isa-summary__value">
                      {customExtensions.size > 0 ? Array.from(customExtensions).sort().join(', ') : '(none selected)'}
                    </span>
                  </div>
                  <div className="isa-summary__row">
                    <span className="isa-summary__label">Total:</span>
                    <span className="isa-summary__value">{totalInstructions} instructions</span>
                  </div>
                </div>
              </div>

              {/* Validation Errors */}
              {!validationResult.valid && (
                <div className="isa-errors">
                  <div className="isa-errors__title">Configuration Errors</div>
                  {validationResult.errors.map((error, index) => (
                    <div key={index} className="isa-errors__item">{error}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="isa-modal__footer">
              <button className="isa-button isa-button--secondary" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className="isa-button isa-button--primary"
                onClick={handleApply}
                disabled={!validationResult.valid}
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Disable Modal */}
      {confirmDisable && (
        <div className="isa-confirm-backdrop" onClick={() => setConfirmDisable(null)}>
          <div className="isa-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="isa-confirm__header">
              <h3 className="isa-confirm__title">Confirm Disable</h3>
              <button
                className="isa-confirm__close"
                onClick={() => setConfirmDisable(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="isa-confirm__content">
              <p>Disabling <strong>{confirmDisable.ext}</strong> will also disable:</p>
              <ul className="isa-confirm__list">
                {confirmDisable.dependents.map(d => (
                  <li key={d}>{d} ({EXTENSION_INFO[d].name})</li>
                ))}
              </ul>
              <p>These extensions require {confirmDisable.ext}.</p>
            </div>
            <div className="isa-confirm__footer">
              <button className="isa-button isa-button--secondary" onClick={() => setConfirmDisable(null)}>
                Keep {confirmDisable.ext} Enabled
              </button>
              <button className="isa-button isa-button--warning" onClick={handleConfirmDisable}>
                Disable All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Break G Modal */}
      {confirmBreakG && (
        <div className="isa-confirm-backdrop" onClick={() => setConfirmBreakG(null)}>
          <div className="isa-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="isa-confirm__header">
              <h3 className="isa-confirm__title">G Bundle No Longer Applicable</h3>
              <button
                className="isa-confirm__close"
                onClick={() => setConfirmBreakG(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="isa-confirm__content">
              <p>Removing <strong>{confirmBreakG}</strong> breaks the G (General) bundle.</p>
              <p>The G extension will be unselected, but the other components (M, A, F, D, Zicsr, Zifencei) will remain enabled if you want to keep them.</p>
              <p>All "via G" badges will be removed.</p>
            </div>
            <div className="isa-confirm__footer">
              <button className="isa-button isa-button--secondary" onClick={() => setConfirmBreakG(null)}>
                Cancel
              </button>
              <button className="isa-button isa-button--warning" onClick={handleConfirmBreakG}>
                Remove {confirmBreakG} and Unselect G
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suggest Enable G Modal */}
      {suggestEnableG && (
        <div className="isa-confirm-backdrop" onClick={handleKeepIndividual}>
          <div className="isa-confirm isa-confirm--success" onClick={(e) => e.stopPropagation()}>
            <div className="isa-confirm__header">
              <h3 className="isa-confirm__title">G Bundle Available</h3>
              <button
                className="isa-confirm__close"
                onClick={handleKeepIndividual}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="isa-confirm__content">
              <p>You've selected all components of the <strong>G (General)</strong> bundle:</p>
              <ul className="isa-confirm__list">
                <li>M - Integer Multiply & Divide</li>
                <li>A - Atomic Instructions</li>
                <li>F - Single-Precision Floating-Point</li>
                <li>D - Double-Precision Floating-Point</li>
                <li>Zicsr - Control & Status Registers</li>
                <li>Zifencei - Instruction Fence</li>
              </ul>
              <p>Would you like to enable G to represent this standard configuration?</p>
            </div>
            <div className="isa-confirm__footer">
              <button className="isa-button isa-button--secondary" onClick={handleKeepIndividual}>
                Keep Individual Selection
              </button>
              <button className="isa-button isa-button--primary" onClick={handleEnableG}>
                Enable G
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ISAVariantSelector;
