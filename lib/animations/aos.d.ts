declare const AOS: {
  init: (options?: {
    offset?: number;
    delay?: number;
    easing?: string;
    duration?: number;
    once?: boolean;
    startEvent?: string;
    throttleDelay?: number;
    debounceDelay?: number;
    disableMutationObserver?: boolean;
    disable?: boolean | string | (() => boolean);
  }) => unknown;
  refresh: () => unknown;
  refreshHard: () => unknown;
};
export default AOS;
