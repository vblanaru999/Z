"use client";

import { useState } from "react";

export function useFields(initial: Record<string, string>) {
  const [fields, setFields] = useState(initial);

  function bind(name: string) {
    return {
      name,
      value: fields[name] ?? "",
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => {
        const value = event.target.value;
        setFields((current) => ({ ...current, [name]: value }));
      },
    };
  }

  function choose(name: string, value: string) {
    return {
      name,
      value,
      checked: fields[name] === value,
      onChange: () => setFields((current) => ({ ...current, [name]: value })),
    };
  }

  return { bind, choose };
}
