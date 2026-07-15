import {
  Typeahead as AstryxTypeahead,
  createStaticSource,
  type SearchableItem,
  type SearchSource,
  type TypeaheadProps,
} from '@astryxdesign/core/Typeahead';

export type { SearchableItem, SearchSource, TypeaheadProps };
export { createStaticSource };

export function Typeahead<T extends SearchableItem>(props: TypeaheadProps<T>) {
  return <AstryxTypeahead<T> {...props} />;
}
Typeahead.displayName = 'Typeahead';
