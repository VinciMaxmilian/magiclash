/**
 * Season content manifest (what each season added). Pure data: the TEMPORADA screen reads it,
 * and ranked seasons in the database use the same numbering.
 */
export interface SeasonDefinition {
  id: number;
  name: string;
  subtitle: string;
  blurb: string;
  characters: readonly string[];
  stages: readonly string[];
}

export const SEASONS: readonly SeasonDefinition[] = [
  {
    id: 1,
    name: 'TEMPORADA 1',
    subtitle: 'NOITE ETERNA',
    blurb: 'Caçadores e criaturas da noite chegam ao MagiClash.',
    characters: ['hunter', 'brawler', 'vampire', 'dhampir', 'summoner'],
    stages: ['throne_hall', 'hunters_library'],
  },
];

export const CURRENT_SEASON = SEASONS[SEASONS.length - 1];
