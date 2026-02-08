import React from 'react';
import './CodeBlock.css';

export interface CodeBlockProps {
  code: string;
  language?: 'pseudocode' | 'asm' | 'plain';
  title?: string;
  showLineNumbers?: boolean;
  className?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'plain',
  title,
  showLineNumbers = false,
  className = ''
}) => {
  const lines = code.split('\n');

  return (
    <div className={`code-block code-block--${language} ${className}`}>
      {title && (
        <div className="code-block__title">
          {title}
        </div>
      )}
      <div className="code-block__content">
        {showLineNumbers && (
          <div className="code-block__line-numbers" aria-hidden="true">
            {lines.map((_, index) => (
              <div key={index} className="code-block__line-number">
                {index + 1}
              </div>
            ))}
          </div>
        )}
        <pre className="code-block__pre">
          <code className="code-block__code">
            {lines.map((line, index) => (
              <div key={index} className="code-block__line">
                {line || ' '}
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
};

export default CodeBlock;
