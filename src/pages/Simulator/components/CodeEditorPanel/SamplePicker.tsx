import React, { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../../../../components/Button';
import { useSimulatorContext } from '../../contexts/SimulatorContext';
import type { BaseISA, Extension, ISAVariant } from '../../types/ISAVariant';
import { formatISAVariant, DEFAULT_VECTOR_CONFIG } from '../../types/ISAVariant';
// ISA confirm modal styles are included in CodeEditorPanel.css

/**
 * Type definitions for sample index data
 */
interface SampleCategory {
  id: string;
  name: string;
  description: string;
  extension: string;
}

interface Sample {
  id: string;
  title: string;
  file: string;
  category: string;
  description: string;
  extension: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  concepts: string[];
  instructionCount: number;
}

interface SampleIndex {
  version: string;
  description: string;
  lastUpdated: string;
  categories: SampleCategory[];
  samples: Sample[];
}

export interface SamplePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSample: (code: string) => void;
  /** Optional ISA variant - if not provided, uses SimulatorContext */
  isaVariant?: ISAVariant;
  /** Optional ISA setter - if not provided, uses SimulatorContext */
  setISAVariant?: (variant: ISAVariant) => void | Promise<void>;
  /** If true, skips ISA upgrade check entirely */
  skipISACheck?: boolean;
  className?: string;
}

/**
 * SamplePicker - Modal component for browsing and loading sample RISC-V programs
 *
 * Features:
 * - Fetches sample index from /samples/index.json
 * - Groups samples by category
 * - Shows difficulty badges and descriptions
 * - Loads .s files into editor on selection
 * - Responsive design (mobile/tablet/desktop)
 */
/**
 * Parse a sample extension string (e.g., "rv32imv") into BaseISA and Extensions
 * @param extensionStr Sample extension string like "rv32i", "rv64im", "rv32imfd"
 * @returns Parsed ISA variant with base and extensions
 */
function parseSampleExtension(extensionStr: string): { base: BaseISA; extensions: Extension[] } {
  const lower = extensionStr.toLowerCase();

  // Determine base ISA
  const base: BaseISA = lower.startsWith('rv64') ? 'RV64I' : 'RV32I';

  // Extract extension letters after "rv32" or "rv64"
  const extPart = lower.replace(/^rv(32|64)i?/, '');

  // Map single letters to Extension types
  const extensionMap: Record<string, Extension> = {
    'm': 'M',
    'a': 'A',
    'f': 'F',
    'd': 'D',
    'c': 'C',
    'v': 'V',
    'q': 'Q',
    'b': 'B',
  };

  const extensions: Extension[] = [];
  for (const char of extPart) {
    const ext = extensionMap[char];
    if (ext) {
      extensions.push(ext);
      // Handle dependencies: D requires F
      if (ext === 'D' && !extensions.includes('F')) {
        extensions.unshift('F');
      }
      // Q requires D (and transitively F)
      if (ext === 'Q') {
        if (!extensions.includes('D')) {
          extensions.unshift('D');
        }
        if (!extensions.includes('F')) {
          extensions.unshift('F');
        }
      }
    }
  }

  // F, D, and V extensions require Zicsr for enabling the FP/Vector units
  // Sample programs use csrs/csrw to set mstatus.FS and mstatus.VS bits
  if (extensions.includes('F') || extensions.includes('D') || extensions.includes('V')) {
    if (!extensions.includes('Zicsr')) {
      extensions.push('Zicsr');
    }
  }

  return { base, extensions };
}

/**
 * Check if current ISA is sufficient for sample requirements
 * @param currentISA Current ISA variant
 * @param requiredBase Required base ISA
 * @param requiredExtensions Required extensions
 * @returns True if current ISA can run the sample
 */
function isISASufficient(
  currentISA: ISAVariant,
  requiredBase: BaseISA,
  requiredExtensions: Extension[]
): boolean {
  // Base must match (RV32 vs RV64)
  const currentIs64 = currentISA.base === 'RV64I';
  const requiredIs64 = requiredBase === 'RV64I';

  if (currentIs64 !== requiredIs64) {
    return false;
  }

  // All required extensions must be present in current ISA
  // Current ISA can have more extensions than required
  const currentExtSet = new Set(currentISA.extensions);

  // Handle G bundle: if current has G, it includes M, A, F, D, Zicsr, Zifencei
  if (currentExtSet.has('G')) {
    currentExtSet.add('M');
    currentExtSet.add('A');
    currentExtSet.add('F');
    currentExtSet.add('D');
    currentExtSet.add('Zicsr');
    currentExtSet.add('Zifencei');
  }

  // Handle B bundle: if current has B, it includes Zba, Zbb, Zbc, Zbs
  if (currentExtSet.has('B')) {
    currentExtSet.add('Zba');
    currentExtSet.add('Zbb');
    currentExtSet.add('Zbc');
    currentExtSet.add('Zbs');
  }

  for (const ext of requiredExtensions) {
    if (!currentExtSet.has(ext)) {
      return false;
    }
  }

  return true;
}

/**
 * Create an upgraded ISA variant that includes all required extensions
 * while preserving existing extensions
 * @param currentISA Current ISA variant
 * @param requiredBase Required base ISA
 * @param requiredExtensions Required extensions
 * @returns New ISA variant with all required extensions
 */
function createUpgradedISA(
  currentISA: ISAVariant,
  requiredBase: BaseISA,
  requiredExtensions: Extension[]
): ISAVariant {
  // Start with required base
  const newBase = requiredBase;

  // Combine current and required extensions
  const extensionSet = new Set<Extension>(currentISA.extensions);
  for (const ext of requiredExtensions) {
    extensionSet.add(ext);
  }

  // If V extension is being added and vectorConfig wasn't set, use default
  const needsVectorConfig = extensionSet.has('V') && !currentISA.vectorConfig;

  return {
    base: newBase,
    extensions: Array.from(extensionSet),
    vectorConfig: needsVectorConfig ? DEFAULT_VECTOR_CONFIG : currentISA.vectorConfig,
  };
}

const SamplePicker: React.FC<SamplePickerProps> = ({
  isOpen,
  onClose,
  onSelectSample,
  isaVariant: propISAVariant,
  setISAVariant: propSetISAVariant,
  skipISACheck = false,
  className = '',
}) => {
  // Use context only if props aren't provided
  // This allows the component to work both with SimulatorContext (FunctionalSimulator)
  // and without it (CPUSimulator) by passing props directly
  let contextISAVariant: ISAVariant | undefined;
  let contextSetISAVariant: ((variant: ISAVariant) => void | Promise<void>) | undefined;

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const context = useSimulatorContext();
    contextISAVariant = context.isaVariant;
    contextSetISAVariant = context.setISAVariant;
  } catch {
    // Context not available - that's fine if props are provided or skipISACheck is true
  }

  const isaVariant = propISAVariant ?? contextISAVariant;
  const setISAVariant = propSetISAVariant ?? contextSetISAVariant;

  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const [sampleIndex, setSampleIndex] = useState<SampleIndex | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [upgradeInfo, setUpgradeInfo] = useState<{ oldISA: string; newISA: string } | null>(null);

  // Fetch sample index when modal opens
  useEffect(() => {
    if (isOpen && !sampleIndex) {
      setLoading(true);
      setError(null);

      fetch('/samples/index.json')
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to fetch sample index: ${response.statusText}`);
          }
          return response.json();
        })
        .then((data: SampleIndex) => {
          setSampleIndex(data);
          // Expand first category by default
          if (data.categories.length > 0) {
            setExpandedCategory(data.categories[0].id);
          }
        })
        .catch((err) => {
          setError(err.message || 'Failed to load samples');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, sampleIndex]);

  // Handle focus management
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';

      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);
    } else {
      document.body.style.overflow = '';

      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Handle Tab key for focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const modal = modalRef.current;
      if (!modal) return;

      const focusableElements = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Toggle category expansion
  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategory((prev) => (prev === categoryId ? null : categoryId));
  }, []);

  // Load a sample file
  const loadSample = useCallback(
    async (sample: Sample) => {
      setLoadingSample(sample.id);
      setError(null);

      try {
        // Check ISA compatibility unless skipISACheck is true
        if (!skipISACheck && isaVariant && setISAVariant) {
          // Parse the sample's required ISA
          const { base: requiredBase, extensions: requiredExtensions } = parseSampleExtension(
            sample.extension
          );

          // Check if current ISA is sufficient
          if (!isISASufficient(isaVariant, requiredBase, requiredExtensions)) {
            // Store old ISA label before upgrade
            const oldLabel = formatISAVariant(isaVariant);

            // Create upgraded ISA
            const upgradedISA = createUpgradedISA(isaVariant, requiredBase, requiredExtensions);

            // Apply the upgrade
            await setISAVariant(upgradedISA);

            // Store upgrade info for modal display (shown after sample loads)
            const newLabel = formatISAVariant(upgradedISA);
            setUpgradeInfo({ oldISA: oldLabel, newISA: newLabel });

            // Auto-dismiss after 4 seconds
            setTimeout(() => {
              setUpgradeInfo(null);
            }, 4000);
          }
        }

        const response = await fetch(`/samples/${sample.file}`);
        if (!response.ok) {
          throw new Error(`Failed to load sample: ${response.statusText}`);
        }
        const code = await response.text();
        onSelectSample(code);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sample');
      } finally {
        setLoadingSample(null);
      }
    },
    [onSelectSample, onClose, isaVariant, setISAVariant, skipISACheck]
  );

  // Get samples for a specific category
  const getSamplesForCategory = useCallback(
    (categoryId: string): Sample[] => {
      if (!sampleIndex) return [];
      return sampleIndex.samples.filter((sample) => sample.category === categoryId);
    },
    [sampleIndex]
  );

  // Get difficulty badge class
  const getDifficultyClass = (difficulty: string): string => {
    switch (difficulty) {
      case 'beginner':
        return 'sample-picker__difficulty--beginner';
      case 'intermediate':
        return 'sample-picker__difficulty--intermediate';
      case 'advanced':
        return 'sample-picker__difficulty--advanced';
      default:
        return '';
    }
  };

  // Handle dismiss of upgrade modal
  const dismissUpgradeModal = useCallback(() => {
    setUpgradeInfo(null);
  }, []);

  return (
    <>
      {/* ISA Upgrade Modal - shown after sample loads */}
      {upgradeInfo && (
        <div
          className="isa-confirm-backdrop"
          onClick={dismissUpgradeModal}
          role="presentation"
        >
          <div
            className="isa-confirm isa-confirm--success"
            role="dialog"
            aria-modal="true"
            aria-labelledby="isa-upgrade-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="isa-confirm__header">
              <h3 id="isa-upgrade-title" className="isa-confirm__title">
                ISA Upgraded
              </h3>
              <button
                className="isa-confirm__close"
                onClick={dismissUpgradeModal}
                aria-label="Close"
                type="button"
              >
                &times;
              </button>
            </div>
            <div className="isa-confirm__content">
              <p>
                ISA upgraded from <strong>{upgradeInfo.oldISA}</strong> to{' '}
                <strong>{upgradeInfo.newISA}</strong> to support this sample program.
              </p>
            </div>
            <div className="isa-confirm__footer">
              <Button variant="primary" size="sm" onClick={dismissUpgradeModal}>
                OK
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sample Picker Modal */}
      {isOpen && (
        <div
          className="sample-picker__backdrop"
          onClick={handleBackdropClick}
          role="presentation"
        >
          <div
            ref={modalRef}
            className={`sample-picker ${className}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-picker-title"
          >
            <div className="sample-picker__header">
              <h2 id="sample-picker-title" className="sample-picker__title">
                Load Sample Program
              </h2>
              <button
                ref={closeButtonRef}
                className="sample-picker__close"
                onClick={onClose}
                aria-label="Close sample picker"
                type="button"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div className="sample-picker__body">
              {loading && (
                <div className="sample-picker__loading">
                  <div className="sample-picker__spinner" />
                  <p>Loading samples...</p>
                </div>
              )}

              {error && (
                <div className="sample-picker__error">
                  <p>Error: {error}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSampleIndex(null);
                      setError(null);
                    }}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {!loading && !error && sampleIndex && (
                <div className="sample-picker__categories">
                  {sampleIndex.categories.map((category) => {
                    const samples = getSamplesForCategory(category.id);
                    const isExpanded = expandedCategory === category.id;

                    return (
                      <div key={category.id} className="sample-picker__category">
                        <button
                          className={`sample-picker__category-header ${
                            isExpanded ? 'sample-picker__category-header--expanded' : ''
                          }`}
                          onClick={() => toggleCategory(category.id)}
                          aria-expanded={isExpanded}
                          type="button"
                        >
                          <div className="sample-picker__category-info">
                            <span className="sample-picker__category-name">{category.name}</span>
                            <span className="sample-picker__category-count">
                              {samples.length} sample{samples.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <svg
                            className={`sample-picker__chevron ${
                              isExpanded ? 'sample-picker__chevron--expanded' : ''
                            }`}
                            width="20"
                            height="20"
                            viewBox="0 0 20 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M5 7.5L10 12.5L15 7.5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>

                        {isExpanded && (
                          <div className="sample-picker__samples">
                            {samples.map((sample) => (
                              <button
                                key={sample.id}
                                className="sample-picker__sample"
                                onClick={() => loadSample(sample)}
                                disabled={loadingSample === sample.id}
                                type="button"
                              >
                                <div className="sample-picker__sample-header">
                                  <span className="sample-picker__sample-title">{sample.title}</span>
                                  <span
                                    className={`sample-picker__difficulty ${getDifficultyClass(
                                      sample.difficulty
                                    )}`}
                                  >
                                    {sample.difficulty}
                                  </span>
                                </div>
                                <p className="sample-picker__sample-description">
                                  {sample.description}
                                </p>
                                <div className="sample-picker__sample-meta">
                                  <span className="sample-picker__sample-instructions">
                                    ~{sample.instructionCount} instructions
                                  </span>
                                  {loadingSample === sample.id && (
                                    <span className="sample-picker__sample-loading">Loading...</span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SamplePicker;
