import { useEffect, useRef, useState } from "react";

interface MovementAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  placeholder?: string;
}

const MAX_SUGGESTIONS = 8;

/**
 * Autocomplete próprio em vez do <datalist> nativo do HTML — o Safari no
 * iOS nunca mostra as sugestões de um datalist, então no celular o campo
 * parecia não ter lista nenhuma.
 */
export function MovementAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
}: MovementAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = value.trim().toLowerCase();
  const filtered = (
    query ? suggestions.filter((s) => s.toLowerCase().includes(query)) : suggestions
  ).slice(0, MAX_SUGGESTIONS);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        required
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg">
          {filtered.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => {
                  onChange(suggestion);
                  setOpen(false);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
