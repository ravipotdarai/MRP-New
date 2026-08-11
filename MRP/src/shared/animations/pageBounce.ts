import {FadeInDown} from 'react-native-reanimated';

/**
 * Soft bounce-in for tab / page content — tuned to match Hub menu cards.
 */
export const pageBounceEnter = FadeInDown.duration(320)
  .springify()
  .damping(14)
  .stiffness(180);

