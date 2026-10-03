import type { ImageSourcePropType } from 'react-native';
import type { IbexMood } from '../../../shared/ibex';

export const ibexArtwork: Record<IbexMood, ImageSourcePropType> = {
  welcome: require('../../assets/brand/betinha-welcome.png'),
  celebrate: require('../../assets/brand/betinha-celebrate.png'),
  rest: require('../../assets/brand/betinha-rest.png'),
  sad: require('../../assets/brand/betinha-sad.png'),
  angry: require('../../assets/brand/betinha-angry.png'),
};
export const ibexPortrait: ImageSourcePropType = require('../../assets/brand/betinha-face.png');
