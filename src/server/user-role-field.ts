type NamedInput = { name: string; input: string };

/** The users form defines role_id twice: a plain text column and the roles relationship. Keep the relationship select. */
export function dropDuplicateUserRoleText<T extends NamedInput>(fields: T[]): T[] {
  if (!fields.some((field) => field.name === "role_id" && field.input === "select")) return fields;
  return fields.filter((field) => field.name !== "role_id" || field.input === "select");
}
