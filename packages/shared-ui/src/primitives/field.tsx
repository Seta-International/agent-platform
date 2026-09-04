import { Field as AstryxField, type FieldProps } from '@astryxdesign/core/Field';

export type { FieldProps } from '@astryxdesign/core/Field';

// Astryx renders the " ∙ Required" and " ∙ Optional" suffixes with identical markup and no
// distinguishing attribute, so globals.css tints the required one by field scope. Controls emit
// aria-required themselves; a Field wrapping a non-Astryx control (rich-text editor) has no such
// descendant, so the required state is stamped here instead.
export function Field({ isRequired, ...props }: FieldProps) {
  return <AstryxField {...props} isRequired={isRequired} data-required={isRequired || undefined} />;
}
Field.displayName = 'Field';
