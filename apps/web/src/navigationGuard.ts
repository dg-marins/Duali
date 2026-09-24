export type NavigationGuard = (
  destination: string,
  proceed: () => void,
) => boolean;

let activeGuard: NavigationGuard | null = null;

export function registerNavigationGuard(guard: NavigationGuard) {
  activeGuard = guard;
  return () => {
    if (activeGuard === guard) activeGuard = null;
  };
}

export function requestNavigation(destination: string, proceed: () => void) {
  if (activeGuard?.(destination, proceed)) return;
  proceed();
}
