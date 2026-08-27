import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from '../../../src/primitives/field';
import { Input } from '../../../src/primitives/input';
import { Textarea } from '../../../src/primitives/textarea';

function statusSuffix(container: HTMLElement) {
  return container.querySelector('.astryx-field-label > span:has(> span[aria-hidden])');
}

describe('field label status suffix', () => {
  it('renders the Required suffix as a direct child span of the field label', () => {
    const { container } = render(<Input label="Job title" isRequired />);
    expect(statusSuffix(container)?.textContent).toContain('Required');
  });

  it('renders the Optional suffix with the same markup, so only the field scope tells them apart', () => {
    const { container } = render(<Textarea label="Feedback" isOptional />);
    expect(statusSuffix(container)?.textContent).toContain('Optional');
  });

  it('marks a required field with aria-required inside the astryx-field container', () => {
    const { container } = render(<Input label="Job title" isRequired />);
    expect(container.querySelector('.astryx-field:has([aria-required="true"])')).not.toBeNull();
  });

  it('leaves an optional field without aria-required, keeping the error tint off it', () => {
    const { container } = render(<Textarea label="Feedback" isOptional />);
    expect(container.querySelector('[aria-required="true"]')).toBeNull();
  });

  it('stamps data-required on a required Field wrapping a non-Astryx control', () => {
    const { container } = render(
      <Field label="About the role" inputID="about" labelID="about-label" isGroupLabel isRequired>
        <div contentEditable />
      </Field>,
    );
    expect(container.querySelector('[aria-required="true"]')).toBeNull();
    expect(container.querySelector('.astryx-field[data-required="true"]')).not.toBeNull();
  });

  it('leaves data-required off a Field that is not required', () => {
    const { container } = render(
      <Field label="Result" inputID="result" labelID="result-label" isGroupLabel>
        <div />
      </Field>,
    );
    expect(container.querySelector('[data-required]')).toBeNull();
  });
});
