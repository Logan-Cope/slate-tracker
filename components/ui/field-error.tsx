type Props = { id: string; message: string | null; "data-testid"?: string };

/**
 * Inline error under a field. Always in the DOM, so the field's
 * aria-describedby points at something, and the form focuses the field when
 * it fails, which is the announcement; while empty it takes no space.
 */
export function FieldError({ id, message, ...rest }: Props) {
  return (
    <p id={id} className={message ? "mt-1.5 text-sm text-danger" : ""} {...rest}>
      {message}
    </p>
  );
}
