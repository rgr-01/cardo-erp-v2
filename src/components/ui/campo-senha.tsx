"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Campo de senha com o olho para mostrar/ocultar o que foi digitado.
export function CampoSenha({ className = "", ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visivel ? "text" : "password"} className={`${className} pr-10`} />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-white"
      >
        {visivel ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
