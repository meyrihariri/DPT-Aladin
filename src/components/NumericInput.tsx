import React, { useState, useEffect } from 'react';

interface NumericInputProps {
  value: number | undefined | null;
  onChange: (val: number) => void;
  min?: number; // Defaults to 0
  prefix?: string; // e.g. "Rp "
  suffix?: string; // e.g. " m", " min"
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
}

const NumericInputComponent: React.FC<NumericInputProps> = ({
  value,
  onChange,
  min = 0,
  prefix,
  suffix,
  placeholder = '0',
  className = 'w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800',
  required = false,
  disabled = false,
  id,
  name
}) => {
  // Format numeric value into Indonesian string representation (dots for thousands, comma for decimals)
  const formatValue = (num: number | undefined | null): string => {
    if (num === undefined || num === null || isNaN(num)) return '';
    
    // Split integer and decimal parts
    const parts = num.toString().split('.');
    // Add thousand separator dots
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    // Join with comma if decimal exists
    return parts.join(',');
  };

  const [displayValue, setDisplayValue] = useState<string>(() => formatValue(value));
  const isFocusedRef = React.useRef(false);
  const lastPropValueRef = React.useRef(value);

  // Sync internal displayValue when prop value changes externally
  useEffect(() => {
    if (value !== lastPropValueRef.current) {
      lastPropValueRef.current = value;
      if (!isFocusedRef.current) {
        setDisplayValue(formatValue(value));
      }
    }
  }, [value]);

  function parseStringToNum(str: string): number {
    if (!str || str.trim() === '') return min;
    // Replace dots (thousand separators) and change comma to dot
    const clean = str.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    if (isNaN(parsed)) return min;
    return Math.max(min, parsed);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Strip prefix if user includes it
    if (prefix && raw.startsWith(prefix)) {
      raw = raw.slice(prefix.length);
    }

    // Keep digits, dots, commas
    let cleaned = raw.replace(/[^0-9.,]/g, '');

    if (cleaned === '') {
      setDisplayValue('');
      onChange(min);
      return;
    }

    const isTypingDecimal = cleaned.endsWith(',') || cleaned.endsWith('.');

    // Parse numeric value
    const normalizedStr = cleaned.replace(/\./g, '').replace(',', '.');
    let parsedNum = parseFloat(normalizedStr);

    if (isNaN(parsedNum)) {
      parsedNum = min;
    } else {
      parsedNum = Math.max(min, parsedNum);
    }

    if (isTypingDecimal) {
      const intStr = Math.floor(parsedNum).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      setDisplayValue(`${intStr},`);
    } else if (cleaned.includes(',') || (cleaned.includes('.') && normalizedStr.includes('.'))) {
      const parts = normalizedStr.split('.');
      const intFormatted = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      const decPart = parts[1] !== undefined ? parts[1] : '';
      setDisplayValue(decPart ? `${intFormatted},${decPart}` : intFormatted);
    } else {
      setDisplayValue(parsedNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
    }

    onChange(parsedNum);
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    const parsed = parseStringToNum(displayValue);
    const finalVal = Math.max(min, parsed);
    setDisplayValue(formatValue(finalVal));
    onChange(finalVal);
  };

  return (
    <div className="relative flex items-center w-full">
      {prefix && (
        <span className="absolute left-3 text-slate-400 font-bold text-xs pointer-events-none select-none">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        id={id}
        name={name}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`${className} ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-12' : ''}`}
      />
      {suffix && (
        <span className="absolute right-3 text-slate-400 font-bold text-xs pointer-events-none select-none">
          {suffix}
        </span>
      )}
    </div>
  );
};

export const NumericInput = React.memo(NumericInputComponent);
