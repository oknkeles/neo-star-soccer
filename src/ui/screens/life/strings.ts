/** All 'life' namespace strings (UI life screens). One registration, one file per screen group. */
import { registerStrings } from '../../../core/i18n';
import type { Lang } from '../../../core/types';
import { common } from './strings/common';
import { training } from './strings/training';
import { lifestyle } from './strings/lifestyle';
import { people } from './strings/people';
import { transfers } from './strings/transfers';
import { competitions } from './strings/competitions';
import { media } from './strings/media';
import { career } from './strings/career';
import { club } from './strings/club';
import { legacy } from './strings/legacy';

type Pack = Record<Lang, Record<string, string>>;
const packs: Pack[] = [common, training, lifestyle, people, transfers, competitions, media, career, club, legacy];

registerStrings('life', {
  tr: Object.assign({}, ...packs.map((p) => p.tr)),
  en: Object.assign({}, ...packs.map((p) => p.en)),
});
