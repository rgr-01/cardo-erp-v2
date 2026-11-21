"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// Campo numerico com setas para cima/baixo no mesmo lugar das nativas, mas no
// visual do sistema (as setinhas do navegador ficam escondidas).
// Mesmo contrato do input nativo: valor como texto, onChange(e.target.value),
// `name` entra no FormData, `required`, `min`, `max`.

export function NumberInput({
  value,
  defaultValue,
  onChange,
  name,
  required,
  disabled,
  min,
  max,
  step = 1,
  className = "",
  placeholder,
  id,
  "aria-label": ariaLabel,
}: {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  inputMode?: string;
}) {
  const [interno, setInterno] = useState(String(defaultValue ?? ""));
  const atual = value !== undefined ? String(value) : interno;

  function emitir(novo: string) {
    if (value === undefined) setInterno(novo);
    onChange?.({ target: { value: novo } });
  }

  function passo(direcao: 1 | -1) {
    if (disabled) return;
    const base = Number(atual);
    const inicio = Number.isFinite(base) && atual !== "" ? base : (min ?? 0) - (direcao === 1 ? step : -step);
    let proximo = inicio + direcao * step;
    if (min !== undefined) proximo = Math.max(min, proximo);
    if (max !== undefined) proximo = Math.min(max, proximo);
    // evita ruido de ponto flutuante (0.1 + 0.2)
    emitir(String(Math.round(proximo * 1e6) / 1e6));
  }

  const botao =
    "flex flex-1 items-center justify-center text-muted transition hover:bg-accent/15 hover:text-accent active:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted";
  const noMinimo = min !== undefined && atual !== "" && Number(atual) <= min;
  const noMaximo = max !== undefined && atual !== "" && Number(atual) >= max;

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        value={atual}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => emitir(e.target.value)}
        style={{ MozAppearance: "textfield" }}
        className={`${className} pr-9 [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none`}
      />
      <div className="absolute inset-y-1 right-1 flex w-6 flex-col overflow-hidden rounded-md border border-surface-border bg-zinc-900/40">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Aumentar"
          disabled={disabled || noMaximo}
          onClick={() => passo(1)}
          className={`${botao} border-b border-surface-border`}
        >
          <ChevronUp size={12} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Diminuir"
          disabled={disabled || noMinimo}
          onClick={() => passo(-1)}
          className={botao}
        >
          <ChevronDown size={12} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
