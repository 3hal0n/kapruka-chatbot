export type ClassValue = string | number | boolean | null | undefined;

/** Dependency-free shadcn-style class joiner. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
