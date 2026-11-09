"use client";

export function DigitPhoneInput({
  id,
  name,
  defaultValue,
  required,
  maxLength,
}: {
  id: string;
  name: string;
  defaultValue: string;
  required: boolean;
  maxLength: number;
}) {
  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="tel"
      defaultValue={defaultValue}
      required={required}
      maxLength={maxLength}
      className="control"
      onInput={(event) => {
        const next = event.currentTarget.value.replace(/(?!^\+)[^\d]/g, "").replace(/^(\+?\d{0,13}).*$/, "$1");
        if (next !== event.currentTarget.value) event.currentTarget.value = next;
      }}
    />
  );
}
