import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Spojí třídy a vyřeší konflikty Tailwindu. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
