import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let knownPreference: boolean | undefined;

export function useMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(knownPreference ?? true);
  useEffect(() => {
    let active = true;
    function update(enabled: boolean) {
      knownPreference = enabled;
      if (active) setReducedMotion(enabled);
    }
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        update(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      update,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reducedMotion;
}
